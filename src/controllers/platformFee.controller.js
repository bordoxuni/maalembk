const prisma = require('../config/prisma');

const getFeeByRequestId = async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);

    const platformFee = await prisma.platformFee.findUnique({
      where: { requestId: requestId },
      include: {
        Request: {
          select: {
            id: true,
            title: true,
            status: true,
            clientId: true,
          },
        },
      },
    });

    if (!platformFee) {
      return res.status(404).json({ message: 'Aucun frais de plateforme trouvé pour cette demande' });
    }

    res.json(platformFee);
  } catch (error) {
    next(error);
  }
};

const getFeesByTechnicianId = async (req, res, next) => {
  try {
    const technicianId = Number(req.params.technicianId);

    const fees = await prisma.platformFee.findMany({
      where: {
        Offer: {
          technicianId: technicianId,
        },
      },
      include: {
        Request: {
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
          },
        },
        Offer: {
          select: {
            id: true,
            price: true,
            technicianId: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Calculate totals
    const totals = fees.reduce(
      (acc, fee) => ({
        totalOriginalPrice: acc.totalOriginalPrice + fee.originalPrice,
        totalFeeAmount: acc.totalFeeAmount + fee.feeAmount,
        totalNetAmount: acc.totalNetAmount + fee.netAmount,
        count: acc.count + 1,
      }),
      {
        totalOriginalPrice: 0,
        totalFeeAmount: 0,
        totalNetAmount: 0,
        count: 0,
      }
    );

    res.json({
      fees,
      summary: {
        totalMissions: totals.count,
        totalOriginalPrice: totals.totalOriginalPrice,
        totalPlatformFees: totals.totalFeeAmount,
        totalNetEarnings: totals.totalNetAmount,
        averageFee: totals.count > 0 ? totals.totalFeeAmount / totals.count : 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getFeesByClientId = async (req, res, next) => {
  try {
    const clientId = Number(req.params.clientId);

    const fees = await prisma.platformFee.findMany({
      where: {
        Request: {
          clientId: clientId,
        },
      },
      include: {
        Request: {
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
          },
        },
        Offer: {
          select: {
            id: true,
            price: true,
            technicianId: true,
            User: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Calculate totals
    const totals = fees.reduce(
      (acc, fee) => ({
        totalOriginalPrice: acc.totalOriginalPrice + fee.originalPrice,
        totalFeeAmount: acc.totalFeeAmount + fee.feeAmount,
        totalNetAmount: acc.totalNetAmount + fee.netAmount,
        count: acc.count + 1,
      }),
      {
        totalOriginalPrice: 0,
        totalFeeAmount: 0,
        totalNetAmount: 0,
        count: 0,
      }
    );

    res.json({
      fees,
      summary: {
        totalMissions: totals.count,
        totalOriginalPrice: totals.totalOriginalPrice,
        totalPlatformFees: totals.totalFeeAmount,
        totalNetPaid: totals.totalNetAmount,
        averageFee: totals.count > 0 ? totals.totalFeeAmount / totals.count : 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getAllFees = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, startDate, endDate } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [fees, total] = await Promise.all([
      prisma.platformFee.findMany({
        where,
        include: {
          Request: {
            select: {
              id: true,
              title: true,
              status: true,
              clientId: true,
              createdAt: true,
            },
          },
          Offer: {
            select: {
              id: true,
              price: true,
              technicianId: true,
              User: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: Number(limit),
      }),
      prisma.platformFee.count({ where }),
    ]);

    // Calculate totals
    const totals = fees.reduce(
      (acc, fee) => ({
        totalOriginalPrice: acc.totalOriginalPrice + fee.originalPrice,
        totalFeeAmount: acc.totalFeeAmount + fee.feeAmount,
        totalNetAmount: acc.totalNetAmount + fee.netAmount,
        count: acc.count + 1,
      }),
      {
        totalOriginalPrice: 0,
        totalFeeAmount: 0,
        totalNetAmount: 0,
        count: 0,
      }
    );

    res.json({
      fees,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
      summary: {
        totalMissions: totals.count,
        totalOriginalPrice: totals.totalOriginalPrice,
        totalPlatformFees: totals.totalFeeAmount,
        totalNetAmount: totals.totalNetAmount,
        averageFee: totals.count > 0 ? totals.totalFeeAmount / totals.count : 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFeeByRequestId,
  getFeesByTechnicianId,
  getFeesByClientId,
  getAllFees,
};
