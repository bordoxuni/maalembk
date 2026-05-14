const prisma = require('../config/prisma');
const fs = require('fs');
const { getSocketIO } = require('../utils/socketHelper');

const getMyTechnicianProfile = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        TechnicianProfile: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    const { passwordHash, ...safeUser } = user;

    // Add explicit mode field for frontend
    const mode = safeUser.role === 'CLIENT' 
      ? 'client' 
      : (safeUser.TechnicianProfile?.isWorkerMode === true ? 'worker' : 'client');

    // Calculate remaining free missions for technicians
    let technicianProfileWithQuota = safeUser.TechnicianProfile;
    if (safeUser.role === 'TECHNICIAN' && safeUser.TechnicianProfile) {
      // Reset monthly quota automatically if needed
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const needsReset =
        safeUser.TechnicianProfile.freeMissionMonth !== currentMonth ||
        safeUser.TechnicianProfile.freeMissionYear !== currentYear;

      if (needsReset) {
        await prisma.technicianProfile.update({
          where: { id: safeUser.TechnicianProfile.id },
          data: {
            freeMissionCount: 0,
            freeMissionMonth: currentMonth,
            freeMissionYear: currentYear,
          },
        });
        safeUser.TechnicianProfile.freeMissionCount = 0;
      }

      // Calculate remaining free missions
      const remainingFreeMissions = Math.max(0, 3 - safeUser.TechnicianProfile.freeMissionCount);
      
      technicianProfileWithQuota = {
        ...safeUser.TechnicianProfile,
        remainingFreeMissions,
      };
    }

    res.json({
      user: {
        ...safeUser,
        mode,
      },
      technicianProfile: technicianProfileWithQuota,
    });
  } catch (error) {
    next(error);
  }
};

const updateTechnicianLocation = async (req, res, next) => {
  try {
    const { latitude, longitude } = req.body;

    if (latitude == null || longitude == null) {
      return res.status(400).json({ message: 'latitude et longitude sont obligatoires' });
    }

    const profile = await prisma.technicianProfile.upsert({
      where: { userId: req.user.id },
      update: {
        latitude: Number(latitude),
        longitude: Number(longitude),
      },
      create: {
        userId: req.user.id,
        latitude: Number(latitude),
        longitude: Number(longitude),
      },
    });

    // Emit technician_status_updated to all technicians
    const io = getSocketIO();
    io.to('technicians').emit('technician_status_updated', {
      technicianId: req.user.id,
      isAvailable: profile.isAvailable,
      location: {
        latitude: profile.latitude,
        longitude: profile.longitude
      }
    });

    res.json(profile);
  } catch (error) {
    next(error);
  }
};

const updateTechnicianAvailability = async (req, res, next) => {
  try {
    const { isAvailable } = req.body;

    if (isAvailable === undefined) {
      return res.status(400).json({ message: 'isAvailable est obligatoire' });
    }

    const profile = await prisma.technicianProfile.upsert({
      where: { userId: req.user.id },
      update: {
        isAvailable: isAvailable === true || isAvailable === 'true',
      },
      create: {
        userId: req.user.id,
        isAvailable: isAvailable === true || isAvailable === 'true',
      },
    });

    // Emit technician_status_updated to all technicians
    const io = getSocketIO();
    io.to('technicians').emit('technician_status_updated', {
      technicianId: req.user.id,
      isAvailable: profile.isAvailable,
      location: {
        latitude: profile.latitude,
        longitude: profile.longitude
      }
    });

    res.json(profile);
  } catch (error) {
    next(error);
  }
};

const updateTechnicianMode = async (req, res, next) => {
  try {
    const { isWorkerMode } = req.body;

    if (isWorkerMode === undefined) {
      return res.status(400).json({ message: 'isWorkerMode est obligatoire' });
    }

    const profile = await prisma.technicianProfile.upsert({
      where: { userId: req.user.id },
      update: {
        isWorkerMode: isWorkerMode === true || isWorkerMode === 'true',
      },
      create: {
        userId: req.user.id,
        isWorkerMode: isWorkerMode === true || isWorkerMode === 'true',
      },
    });

    res.json(profile);
  } catch (error) {
    next(error);
  }
};

const getTechnicianRequests = async (req, res, next) => {
  try {
    const technicianProfile = await prisma.technicianProfile.findUnique({
      where: { userId: req.user.id },
      include: {
        TechnicianCategory: true,
      },
    });

    if (!technicianProfile) {
      return res.status(404).json({ message: 'Profil technicien introuvable' });
    }

    // Check if technician has location set
    if (!technicianProfile.latitude || !technicianProfile.longitude) {
      return res.status(400).json({ 
        message: 'Veuillez définir votre position pour voir les demandes',
        requiresLocation: true 
      });
    }

    const categoryIds = technicianProfile.TechnicianCategory.map((item) => item.categoryId);

    // Get all requests matching technician's categories
    const allRequests = await prisma.request.findMany({
      where: {
        status: 'OPEN',
        categoryId: categoryIds.length > 0 ? { in: categoryIds } : undefined,
      },
      include: {
        ServiceCategory: true,
        User: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Filter requests within 15km radius using Haversine formula
    const requestsWithinRadius = allRequests.filter((request) => {
      const distance = calculateDistance(
        technicianProfile.latitude,
        technicianProfile.longitude,
        request.latitude,
        request.longitude
      );
      return distance <= 15; // 15km radius
    });

    res.json(requestsWithinRadius);
  } catch (error) {
    next(error);
  }
};

// Helper function to calculate distance between two points using Haversine formula
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return distance;
};

const verifyIdentity = async (req, res, next) => {
  try {
    if (!req.files) {
      return res.status(400).json({ message: 'No files uploaded. Ensure you are sending multipart/form-data with idImage and selfie fields' });
    }

    const { idImage, selfie } = req.files;

    if (!idImage || !idImage[0] || !selfie || !selfie[0]) {
      return res.status(400).json({ message: 'Both idImage and selfie files are required' });
    }

    // Simulation mode: do not rely on an external verification service.
    // As soon as both images are uploaded, we mark the technician as verified.
    const isVerified = true;
    const confidence = 1;

    await prisma.technicianProfile.upsert({
      where: { userId: req.user.id },
      update: { isVerified },
      create: { userId: req.user.id, isVerified },
    });

    res.json({
      verified: isVerified,
      confidence: confidence,
      message: 'Identity verified (simulated)',
    });

    // Clean up temporary uploaded files
    try {
      fs.unlinkSync(idImage[0].path);
      fs.unlinkSync(selfie[0].path);
    } catch (cleanupError) {
      console.error('Error cleaning up verification files:', cleanupError);
    }
  } catch (error) {
    // Clean up temporary files on error
    const idImageFile = req.files?.idImage?.[0];
    const selfieFile = req.files?.selfie?.[0];
    if (idImageFile?.path) {
      try { fs.unlinkSync(idImageFile.path); } catch (e) {}
    }
    if (selfieFile?.path) {
      try { fs.unlinkSync(selfieFile.path); } catch (e) {}
    }

    next(error);
  }
};

const getMyOffers = async (req, res, next) => {
  try {
    // NOTE: Some environments may contain orphaned offers (requestId points to a missing Request),
    // which makes `include: { Request: true }` throw:
    // "Inconsistent query result: Field Request is required to return data, got null instead."
    // To keep this endpoint resilient, we fetch offers first, then hydrate requests manually and
    // drop orphaned records from the response.
    const offers = await prisma.offer.findMany({
      where: {
        technicianId: req.user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        requestId: true,
        technicianId: true,
        price: true,
        message: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const requestIds = [...new Set(offers.map((o) => o.requestId))];

    const requests = await prisma.request.findMany({
      where: { id: { in: requestIds } },
      include: {
        User: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        ServiceCategory: true,
      },
    });

    const requestById = new Map(requests.map((r) => [r.id, r]));
    const hydratedOffers = offers
      .map((offer) => ({
        ...offer,
        Request: requestById.get(offer.requestId) || null,
      }))
      .filter((offer) => offer.Request !== null);

    res.json(hydratedOffers);
  } catch (error) {
    next(error);
  }
};

const getActiveRequests = async (req, res, next) => {
  try {
    const activeRequests = await prisma.offer.findMany({
      where: {
        technicianId: req.user.id,
        status: {
          in: ['ACCEPTED', 'DONE'], // Active or completed missions
        },
      },
      include: {
        Request: {
          include: {
            ServiceCategory: true,
            User: {
              select: {
                id: true,
                fullName: true,
                email: true,
                phone: true,
                profilePicture: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Transform the data to focus on requests
    const requests = activeRequests.map((offer) => ({
      id: offer.Request.id,
      title: offer.Request.title,
      description: offer.Request.description,
      budget: offer.Request.budget,
      status: offer.Request.status,
      offerStatus: offer.status,
      offerId: offer.id,
      price: offer.price,
      message: offer.message,
      createdAt: offer.Request.createdAt,
      updatedAt: offer.Request.updatedAt,
      ServiceCategory: offer.Request.ServiceCategory,
      Client: offer.Request.User,
      latitude: offer.Request.latitude,
      longitude: offer.Request.longitude,
      addressText: offer.Request.addressText,
    }));

    res.json(requests);
  } catch (error) {
    next(error);
  }
};

const getTechnicianById = async (req, res, next) => {
  try {
    const technicianId = Number(req.params.id);

    // Validate technicianId
    if (!technicianId || isNaN(technicianId)) {
      return res.status(400).json({ message: 'Invalid technician ID' });
    }

    const technician = await prisma.user.findFirst({
      where: { id: technicianId, role: 'TECHNICIAN' },
      include: {
        TechnicianProfile: true,
      },
    });

    if (!technician) {
      return res.status(404).json({ message: 'Technician introuvable' });
    }

    // Count completed missions
    const completedMissions = await prisma.offer.count({
      where: {
        technicianId: technicianId,
        status: 'DONE',
      },
    });

    const { passwordHash, ...safeTechnician } = technician;

    res.json({
      id: safeTechnician.id,
      fullName: safeTechnician.fullName,
      phone: safeTechnician.phone,
      profilePicture: safeTechnician.profilePicture,
      averageRating: safeTechnician.TechnicianProfile?.averageRating || 0,
      completedMissions: completedMissions,
      isVerified: safeTechnician.TechnicianProfile?.isVerified || false,
      bio: safeTechnician.TechnicianProfile?.bio || '',
      isAvailable: safeTechnician.TechnicianProfile?.isAvailable || false,
    });
  } catch (error) {
    next(error);
  }
};

const updateBalance = async (req, res, next) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Le montant doit être positif' });
    }

    const updatedProfile = await prisma.technicianProfile.update({
      where: { userId: req.user.id },
      data: {
        sold: {
          increment: Number(amount),
        },
      },
    });

    res.json({
      message: 'Solde mis à jour avec succès',
      newBalance: updatedProfile.sold,
      addedAmount: Number(amount),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyTechnicianProfile,
  updateTechnicianLocation,
  updateTechnicianAvailability,
  updateTechnicianMode,
  getTechnicianRequests,
  getActiveRequests,
  getTechnicianById,
  verifyIdentity,
  getMyOffers,
  updateBalance,
};
