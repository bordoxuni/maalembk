const prisma = require('../config/prisma');

const resolveAssignedOffer = (request) => {
  if (request.selectedOfferId) {
    return request.Offer.find(
      (offer) =>
        offer.id === request.selectedOfferId &&
        ['ACCEPTED', 'DONE'].includes(offer.status)
    );
  }

  return request.Offer.find((offer) => ['ACCEPTED', 'DONE'].includes(offer.status));
};

const createReview = async (req, res, next) => {
  try {
    const { requestId, rating, comment } = req.body;

    if (!requestId || !rating) {
      return res.status(400).json({
        message: 'requestId et rating sont obligatoires',
      });
    }

    const numericRating = Number(rating);

    if (numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        message: 'La note doit être comprise entre 1 et 5',
      });
    }

    const request = await prisma.request.findUnique({
      where: { id: Number(requestId) },
      include: {
        Offer: true,
      },
    });

    if (!request) {
      return res.status(404).json({ message: 'Demande introuvable' });
    }

    if (request.clientId !== req.user.id) {
      return res.status(403).json({
        message: 'Seul le client propriétaire peut laisser un avis',
      });
    }

    if (request.status !== 'DONE') {
      return res.status(400).json({
        message: 'La mission doit être terminée avant de laisser un avis',
      });
    }

    const assignedOffer = resolveAssignedOffer(request);

    if (!assignedOffer) {
      return res.status(400).json({
        message: 'Aucune offre acceptée trouvée pour cette demande',
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingReview = await tx.review.findFirst({
        where: {
          requestId: Number(requestId),
          reviewerId: req.user.id,
        },
      });

      if (existingReview) {
        return { duplicate: true };
      }

      const review = await tx.review.create({
        data: {
          requestId: Number(requestId),
          reviewerId: req.user.id,
          reviewedUserId: assignedOffer.technicianId,
          rating: numericRating,
          comment,
        },
      });

      const ratingStats = await tx.review.aggregate({
        where: {
          reviewedUserId: assignedOffer.technicianId,
        },
        _avg: { rating: true },
      });

      const average = Number(ratingStats._avg.rating || 0);

      const technicianProfile = await tx.technicianProfile.findUnique({
        where: { userId: assignedOffer.technicianId },
      });

      if (technicianProfile) {
        await tx.technicianProfile.update({
          where: { userId: assignedOffer.technicianId },
          data: {
            averageRating: average,
          },
        });
      }

      return { review, average };
    });

    if (result.duplicate) {
      return res.status(400).json({
        message: 'Vous avez déjà laissé un avis pour cette mission',
      });
    }

    res.status(201).json({
      message: 'Avis ajouté avec succès',
      review: result.review,
      newAverageRating: result.average,
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({
        message: 'Vous avez déjà laissé un avis pour cette mission',
      });
    }
    next(error);
  }
};

const createClientReview = async (req, res, next) => {
  try {
    const { requestId, rating, comment } = req.body;

    if (!requestId || !rating) {
      return res.status(400).json({
        message: 'requestId et rating sont obligatoires',
      });
    }

    const numericRating = Number(rating);

    if (numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        message: 'La note doit être comprise entre 1 et 5',
      });
    }

    const request = await prisma.request.findUnique({
      where: { id: Number(requestId) },
      include: {
        Offer: true,
      },
    });

    if (!request) {
      return res.status(404).json({ message: 'Demande introuvable' });
    }

    if (request.status !== 'DONE') {
      return res.status(400).json({
        message: 'La mission doit être terminée avant de laisser un avis',
      });
    }

    const assignedOffer = resolveAssignedOffer(request);

    if (!assignedOffer) {
      return res.status(400).json({
        message: 'Aucune offre acceptée trouvée pour cette demande',
      });
    }

    // Verify the technician is rating the client (technician must be the one who did the work)
    if (assignedOffer.technicianId !== req.user.id) {
      return res.status(403).json({
        message: 'Seul le technicien assigné peut évaluer le client',
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingReview = await tx.review.findFirst({
        where: {
          requestId: Number(requestId),
          reviewerId: req.user.id,
        },
      });

      if (existingReview) {
        return { duplicate: true };
      }

      const review = await tx.review.create({
        data: {
          requestId: Number(requestId),
          reviewerId: req.user.id,
          reviewedUserId: request.clientId,
          rating: numericRating,
          comment,
        },
      });

      const ratingStats = await tx.review.aggregate({
        where: {
          reviewedUserId: request.clientId,
        },
        _avg: { rating: true },
      });

      const clientAverage = Number(ratingStats._avg.rating || 0);

      await tx.user.update({
        where: { id: request.clientId },
        data: {
          averageRating: clientAverage,
        },
      });

      return { review, clientAverage };
    });

    if (result.duplicate) {
      return res.status(400).json({
        message: 'Vous avez déjà laissé un avis pour cette mission',
      });
    }

    res.status(201).json({
      message: 'Avis client ajouté avec succès',
      review: result.review,
      newAverageRating: result.clientAverage,
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({
        message: 'Vous avez déjà laissé un avis pour cette mission',
      });
    }
    next(error);
  }
};

const getClientReviews = async (req, res, next) => {
  try {
    const clientId = Number(req.params.id);

    const reviews = await prisma.review.findMany({
      where: {
        reviewedUserId: clientId,
      },
      include: {
        User_Review_reviewerIdToUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        Request: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(
      reviews.map((review) => ({
        id: review.id,
        requestId: review.requestId,
        reviewerId: review.reviewerId,
        reviewedUserId: review.reviewedUserId,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        reviewer: review.User_Review_reviewerIdToUser,
        request: review.Request,
      }))
    );
  } catch (error) {
    next(error);
  }
};

const getTechnicianReviews = async (req, res, next) => {
  try {
    const technicianId = Number(req.params.id);

    const reviews = await prisma.review.findMany({
      where: {
        reviewedUserId: technicianId,
      },
      include: {
        User_Review_reviewerIdToUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        Request: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(
      reviews.map((review) => ({
        id: review.id,
        requestId: review.requestId,
        reviewerId: review.reviewerId,
        reviewedUserId: review.reviewedUserId,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        reviewer: review.User_Review_reviewerIdToUser,
        request: review.Request,
      }))
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createReview,
  createClientReview,
  getTechnicianReviews,
  getClientReviews,
};
