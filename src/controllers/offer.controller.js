const prisma = require('../config/prisma');
const { getSocketIO } = require('../utils/socketHelper');

const createOffer = async (req, res, next) => {
  try {
    const { requestId, price, message } = req.body;

    if (!requestId || !price) {
      return res.status(400).json({ message: 'requestId et price sont obligatoires' });
    }

    // Check technician access rules (sold OR free missions)
    const requiredSold = 20;
    const technicianProfile = await prisma.technicianProfile.findUnique({
      where: { userId: req.user.id },
      select: { id: true, sold: true, freeMissionCount: true, freeMissionMonth: true, freeMissionYear: true },
    });

    if (!technicianProfile) {
      return res.status(404).json({ message: 'Profil technicien introuvable' });
    }

    // Reset monthly free quota automatically
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const needsReset =
      technicianProfile.freeMissionMonth !== currentMonth ||
      technicianProfile.freeMissionYear !== currentYear;

    if (needsReset) {
      await prisma.technicianProfile.update({
        where: { id: technicianProfile.id },
        data: {
          freeMissionCount: 0,
          freeMissionMonth: currentMonth,
          freeMissionYear: currentYear,
        },
      });
      technicianProfile.freeMissionCount = 0;
    }

    const hasSold = technicianProfile.sold >= requiredSold;
    const hasFreeMissions = technicianProfile.freeMissionCount < 3;

    if (!hasSold && !hasFreeMissions) {
      return res.status(403).json({
        message: "Quota gratuit épuisé. Veuillez recharger votre solde.",
        code: "FREE_QUOTA_EXHAUSTED",
        requiredSold,
        currentSold: technicianProfile.sold,
      });
    }

    const request = await prisma.request.findUnique({
      where: { id: Number(requestId) },
    });

    if (!request) {
      return res.status(404).json({ message: 'Demande introuvable' });
    }

    if (request.status !== 'OPEN') {
      return res.status(400).json({ message: 'Cette demande n’accepte plus d’offres' });
    }

    const existingOffer = await prisma.offer.findFirst({
      where: {
        requestId: Number(requestId),
        technicianId: req.user.id,
        status: {
          in: ['PENDING', 'ACCEPTED', 'DONE'],
        },
      },
    });

    if (existingOffer) {
      return res.status(400).json({
        message: 'Vous avez déjà une offre active pour cette demande',
      });
    }

    // Check if price differs from request budget
    const offerPrice = Number(price);
    const isPriceDifferent = offerPrice !== request.budget;
    const offerStatus = isPriceDifferent ? 'PENDING' : 'ACCEPTED';

    // Create offer and update request status in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the offer
      const newOffer = await tx.offer.create({
        data: {
          requestId: Number(requestId),
          technicianId: req.user.id,
          price: offerPrice,
          message,
          status: offerStatus, // Set status based on price comparison
        },
        include: {
          User: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              role: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });

      // Only update request status if offer is accepted (same price)
      if (!isPriceDifferent) {
        await tx.request.update({
          where: { id: Number(requestId) },
          data: {
            status: 'IN_PROGRESS',
            selectedOfferId: newOffer.id,
            usedFreeQuota: !hasSold,
          },
        });

        // If technician is using the free quota (sold < requiredSold), consume it now
        if (!hasSold) {
          await tx.technicianProfile.update({
            where: { id: technicianProfile.id },
            data: {
              freeMissionCount: {
                increment: 1,
              },
            },
          });
        }
      }

      return newOffer;
    });

    // Emit appropriate socket events based on offer status
    const io = getSocketIO();
    
    if (isPriceDifferent) {
      // Price different - emit new_offer for client approval
      io.to(`client:${request.clientId}`).emit('new_offer', {
        requestId: Number(requestId),
        offer: result
      });
      
      io.to(`technician:${req.user.id}`).emit('offer_pending', {
        requestId: Number(requestId),
        offerId: result.id,
        status: 'PENDING',
        message: 'Different price - waiting for client approval'
      });
    } else {
      // Same price - auto-accept
      io.to(`technician:${req.user.id}`).emit('offer_accepted', {
        requestId: Number(requestId),
        offerId: result.id,
        status: 'ACCEPTED'
      });
      io.to(`client:${request.clientId}`).emit('offer_accepted', {
        requestId: Number(requestId),
        offerId: result.id,
        status: 'ACCEPTED'
      });

      // Emit request_updated to both client and technician
      io.to(`client:${request.clientId}`).emit('request_updated', {
        requestId: Number(requestId),
        status: 'IN_PROGRESS'
      });
      io.to(`technician:${req.user.id}`).emit('request_updated', {
        requestId: Number(requestId),
        status: 'IN_PROGRESS'
      });
    }

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const getOffersForRequest = async (req, res, next) => {
  try {
    const requestId = Number(req.params.id);

    const request = await prisma.request.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      return res.status(404).json({ message: 'Demande introuvable' });
    }

    if (request.clientId !== req.user.id) {
      return res.status(403).json({ message: 'Action non autorisée' });
    }

    const offers = await prisma.offer.findMany({
      where: { requestId },
      include: {
        User: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    res.json(offers);
  } catch (error) {
    next(error);
  }
};

const acceptOffer = async (req, res, next) => {
  try {
    const offerId = Number(req.params.id);
    const requiredSold = 20;

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        Request: true,
        User: {
          select: {
            id: true,
            fullName: true,
            email: true,
            technicianProfile: true,
          },
        },
      },
    });

    if (!offer) {
      return res.status(404).json({ message: 'Offre introuvable' });
    }

    if (!offer.Request) {
      return res.status(404).json({ message: 'Demande associée introuvable' });
    }

    if (offer.Request.clientId !== req.user.id) {
      return res.status(403).json({ message: 'Action non autorisée' });
    }

    // Get technician profile
    const technician = offer.User;
    const profile = technician.technicianProfile;

    if (!profile) {
      return res.status(404).json({ message: 'Profil technicien introuvable' });
    }

    // Reset monthly quota automatically
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const needsReset =
      profile.freeMissionMonth !== currentMonth ||
      profile.freeMissionYear !== currentYear;

    if (needsReset) {
      await prisma.technicianProfile.update({
        where: { id: profile.id },
        data: {
          freeMissionCount: 0,
          freeMissionMonth: currentMonth,
          freeMissionYear: currentYear,
        },
      });
      profile.freeMissionCount = 0;
    }

    // Check access rules
    const hasSold = profile.sold >= requiredSold;
    const hasFreeMissions = profile.freeMissionCount < 3;

    if (!hasSold && !hasFreeMissions) {
      return res.status(403).json({
        message: "Quota gratuit épuisé. Veuillez recharger votre solde.",
        code: "FREE_QUOTA_EXHAUSTED",
        requiredSold,
        currentSold: profile.sold,
      });
    }

    // Perform all updates in a transaction
    await prisma.$transaction(async (tx) => {
      // Update offer status
      await tx.offer.update({
        where: { id: offerId },
        data: { status: 'ACCEPTED' },
      });

      // Refuse other offers
      await tx.offer.updateMany({
        where: {
          requestId: offer.Request.id,
          id: { not: offerId },
        },
        data: { status: 'REFUSED' },
      });

      // Update request status
      await tx.request.update({
        where: { id: offer.Request.id },
        data: {
          status: 'IN_PROGRESS',
          selectedOfferId: offerId,
          usedFreeQuota: !hasSold,
        },
      });

      // Consume free mission if needed (only when sold < requiredSold)
      if (!hasSold) {
        await tx.technicianProfile.update({
          where: { id: profile.id },
          data: {
            freeMissionCount: {
              increment: 1,
            },
          },
        });
      }
    });

    // Emit offer_accepted to both technician and client
    const io = getSocketIO();
    io.to(`technician:${offer.technicianId}`).emit('offer_accepted', {
      requestId: offer.Request.id,
      offerId: offer.id,
      status: 'ACCEPTED'
    });
    io.to(`client:${offer.Request.clientId}`).emit('offer_accepted', {
      requestId: offer.Request.id,
      offerId: offer.id,
      status: 'ACCEPTED'
    });

    // Emit request_updated to both client and assigned technician
    io.to(`client:${offer.Request.clientId}`).emit('request_updated', {
      requestId: offer.Request.id,
      status: 'IN_PROGRESS'
    });
    io.to(`technician:${offer.technicianId}`).emit('request_updated', {
      requestId: offer.Request.id,
      status: 'IN_PROGRESS'
    });

    res.json({ message: 'Offre acceptée avec succès' });
  } catch (error) {
    next(error);
  }
};

const refuseOffer = async (req, res, next) => {
  try {
    const offerId = Number(req.params.id);

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        Request: true,
      },
    });

    if (!offer) {
      return res.status(404).json({ message: 'Offre introuvable' });
    }

    if (!offer.Request) {
      return res.status(404).json({ message: 'Demande associée introuvable' });
    }

    if (offer.Request.clientId !== req.user.id) {
      return res.status(403).json({ message: 'Action non autorisée' });
    }

    await prisma.offer.update({
      where: { id: offerId },
      data: { status: 'REFUSED' },
    });

    // Emit offer_refused to the technician
    const io = getSocketIO();
    io.to(`technician:${offer.technicianId}`).emit('offer_refused', {
      requestId: offer.Request.id,
      offerId: offer.id,
      status: 'REFUSED'
    });

    res.json({ message: 'Offre refusée avec succès' });
  } catch (error) {
    next(error);
  }
};

const cancelOffer = async (req, res, next) => {
  try {
    const offerId = Number(req.params.id);

    if (!offerId || isNaN(offerId)) {
      return res.status(400).json({ message: 'ID d\'offre invalide' });
    }

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      return res.status(404).json({ message: 'Offre introuvable' });
    }

    // Only the technician who made the offer can cancel it
    if (offer.technicianId !== req.user.id) {
      return res.status(403).json({ message: 'Action non autorisée' });
    }

    // Only pending offers can be cancelled
    if (offer.status !== 'PENDING') {
      return res.status(400).json({ message: 'Seules les offres en attente peuvent être annulées' });
    }

    await prisma.offer.update({
      where: { id: offerId },
      data: { status: 'CANCELLED' },
    });

    res.json({ message: 'Offre annulée avec succès' });
  } catch (error) {
    next(error);
  }
};

const deleteOffer = async (req, res, next) => {
  try {
    const offerId = Number(req.params.id);

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      return res.status(404).json({ message: 'Offre introuvable' });
    }

    // Only the technician who made the offer can delete it
    if (offer.technicianId !== req.user.id) {
      return res.status(403).json({ message: 'Action non autorisée' });
    }

    await prisma.offer.delete({
      where: { id: offerId },
    });

    res.json({ message: 'Offre supprimée avec succès' });
  } catch (error) {
    next(error);
  }
};

const cancelAcceptedOffer = async (req, res, next) => {
  try {
    const offerId = Number(req.params.id);

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        Request: true,
      },
    });

    if (!offer) {
      return res.status(404).json({ message: 'Offre introuvable' });
    }

    if (!offer.Request) {
      return res.status(404).json({ message: 'Demande associée introuvable' });
    }

    // Only the technician who made the offer can cancel it
    if (offer.technicianId !== req.user.id) {
      return res.status(403).json({ message: 'Action non autorisée' });
    }

    // Only accepted offers can be cancelled with this endpoint
    if (offer.status !== 'ACCEPTED') {
      return res.status(400).json({ message: 'Seules les offres acceptées peuvent être annulées avec cette endpoint' });
    }

    await prisma.$transaction([
      // Update offer status to CANCELLED
      prisma.offer.update({
        where: { id: offerId },
        data: { status: 'CANCELLED' },
      }),
      // Reset request status to OPEN and clear selected offer
      prisma.request.update({
        where: { id: offer.Request.id },
        data: {
          status: 'OPEN',
          selectedOfferId: null,
        },
      }),
    ]);

    // Emit events to notify client and other technicians
    const io = getSocketIO();
    
    // Notify the client that the accepted offer was cancelled
    io.to(`client:${offer.Request.clientId}`).emit('offer_cancelled', {
      requestId: offer.Request.id,
      offerId: offer.id,
      status: 'CANCELLED'
    });

    // Notify all technicians that request is back to OPEN
    io.to('technicians').emit('request_updated', {
      requestId: offer.Request.id,
      status: 'OPEN'
    });

    res.json({ message: 'Offre acceptée annulée avec succès' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOffer,
  getOffersForRequest,
  acceptOffer,
  refuseOffer,
  cancelOffer,
  cancelAcceptedOffer,
  deleteOffer,
};
