const prisma = require('../config/prisma');
const { getSocketIO } = require('../utils/socketHelper');

const markRequestDone = async (req, res, next) => {
  try {
    const requestId = Number(req.params.id);

    const request = await prisma.request.findUnique({
      where: { id: requestId },
      include: {
        Offer: true,
      },
    });

    if (!request) {
      return res.status(404).json({ message: 'Demande introuvable' });
    }

    if (request.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        message: 'Seules les demandes en cours peuvent être terminées',
      });
    }

    const acceptedOffer = request.Offer.find((offer) => offer.status === 'ACCEPTED');

    if (!acceptedOffer) {
      return res.status(400).json({
        message: 'Aucune offre acceptée trouvée pour cette demande',
      });
    }

    const isClient = req.user.id === request.clientId;
    const isSelectedTechnician = req.user.id === acceptedOffer.technicianId;

    if (!isClient && !isSelectedTechnician) {
      return res.status(403).json({ message: 'Action non autorisée' });
    }

    // Calculate platform fee when mission is completed.
    // If the mission used free quota, platform fee is waived and MUST NOT decrement sold.
    const feePercentage = request.usedFreeQuota ? 0 : 0.10;
    const feeAmount = acceptedOffer.price * feePercentage;
    const netAmount = acceptedOffer.price - feeAmount;

    const txOps = [
      prisma.request.update({
        where: { id: requestId },
        data: {
          status: 'DONE',
        },
      }),
      prisma.offer.update({
        where: { id: acceptedOffer.id },
        data: {
          status: 'DONE',
        },
      }),
      prisma.platformFee.create({
        data: {
          requestId: requestId,
          offerId: acceptedOffer.id,
          originalPrice: acceptedOffer.price,
          feeAmount: feeAmount,
          netAmount: netAmount,
          feePercentage: feePercentage,
        },
      }),
    ];

    if (!request.usedFreeQuota && feeAmount > 0) {
      // Deduct platform fee from technician's sold balance only for paid missions
      txOps.push(
        prisma.technicianProfile.update({
          where: { userId: acceptedOffer.technicianId },
          data: {
            sold: {
              decrement: feeAmount,
            },
          },
        })
      );
    }

    const updatedRequest = await prisma.$transaction(txOps);

    const requestWithDetails = await prisma.request.findUnique({
      where: { id: requestId },
      include: {
        ServiceCategory: true,
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

    // Emit request_updated to both client and assigned technician
    const io = getSocketIO();
    
    io.to(`client:${requestWithDetails.clientId}`).emit('request_updated', {
      requestId: requestWithDetails.id,
      status: requestWithDetails.status
    });
    
    if (acceptedOffer) {
      io.to(`technician:${acceptedOffer.technicianId}`).emit('request_updated', {
        requestId: requestWithDetails.id,
        status: requestWithDetails.status
      });
    }

    res.json({
      message: 'Mission marquée comme terminée',
      request: requestWithDetails,
      platformFee: {
        originalPrice: acceptedOffer.price,
        feeAmount: feeAmount,
        netAmount: netAmount,
        feePercentage: feePercentage
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { markRequestDone };
