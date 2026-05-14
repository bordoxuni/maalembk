const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');
const { generateToken } = require('../utils/jwt');

const register = async (req, res, next) => {
  try {
    const { fullName, email, phone, password, role } = req.body;

    if (!fullName || !email || !password || !role) {
      return res.status(400).json({ message: 'Champs obligatoires manquants' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ message: 'Email déjà utilisé' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        phone,
        passwordHash,
        role,
      },
    });

    if (role === 'TECHNICIAN') {
      await prisma.technicianProfile.create({
        data: {
          userId: user.id,
        },
      });
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    // Fetch user with technician profile for response
    const userWithProfile = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        TechnicianProfile: true,
      },
    });

    const { passwordHash: _hash, ...safeUser } = userWithProfile;

    // Add explicit mode field for frontend
    const mode = safeUser.role === 'CLIENT' 
      ? 'client' 
      : (safeUser.TechnicianProfile?.isWorkerMode === true ? 'worker' : 'client');

    res.status(201).json({
      message: 'Inscription réussie',
      token,
      user: {
        ...safeUser,
        mode,
      },
    });
  } catch (error) {
    next(error);
  }
};

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return Boolean(value);
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        TechnicianProfile: true,
      },
    });

    if (!user) {
      return res.status(400).json({ message: 'Email ou mot de passe incorrect' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      return res.status(400).json({ message: 'Email ou mot de passe incorrect' });
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    const { passwordHash, ...safeUser } = user;

    // Add explicit mode field for frontend
    const mode = safeUser.role === 'CLIENT' 
      ? 'client' 
      : (safeUser.TechnicianProfile?.isWorkerMode === true ? 'worker' : 'client');

    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        ...safeUser,
        mode,
      },
    });
  } catch (error) {
    next(error);
  }
};

const me = async (req, res, next) => {
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

    res.json({
      ...safeUser,
      mode,
    });
  } catch (error) {
    next(error);
  }
};

const promoteToTechnician = async (req, res, next) => {
  try {
    const {
      bio,
      skillsText,
      radiusKm,
      latitude,
      longitude,
      isAvailable,
      isWorkerMode,
    } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        TechnicianProfile: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    const technicianProfileData = {
      bio,
      skillsText,
      ...(radiusKm !== undefined ? { radiusKm: Number(radiusKm) } : {}),
      ...(latitude !== undefined ? { latitude: Number(latitude) } : {}),
      ...(longitude !== undefined ? { longitude: Number(longitude) } : {}),
      ...(isAvailable !== undefined ? { isAvailable: parseBoolean(isAvailable) } : {}),
      ...(isWorkerMode !== undefined ? { isWorkerMode: parseBoolean(isWorkerMode) } : {}),
    };

    const updatedUser = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          role: 'TECHNICIAN',
        },
      });

      await tx.technicianProfile.upsert({
        where: { userId: user.id },
        update: technicianProfileData,
        create: {
          userId: user.id,
          ...technicianProfileData,
        },
      });

      return updated;
    });

    const refreshedToken = generateToken({
      id: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
    });

    const refreshedUser = await prisma.user.findUnique({
      where: { id: updatedUser.id },
      include: {
        TechnicianProfile: true,
      },
    });

    const { passwordHash, ...safeUser } = refreshedUser;

    // Add explicit mode field for frontend
    const mode = safeUser.role === 'CLIENT' 
      ? 'client' 
      : (safeUser.TechnicianProfile?.isWorkerMode === true ? 'worker' : 'client');

    res.json({
      message: 'Utilisateur promu technicien avec succès',
      token: refreshedToken,
      user: {
        ...safeUser,
        mode,
      },
      technicianProfile: safeUser.TechnicianProfile,
    });
  } catch (error) {
    next(error);
  }
};

const setTechnicianMode = async (req, res, next) => {
  try {
    const { isWorkerMode } = req.body;

    if (isWorkerMode === undefined) {
      return res.status(400).json({ message: 'isWorkerMode est obligatoire' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        TechnicianProfile: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    const profile = await prisma.technicianProfile.upsert({
      where: { userId: user.id },
      update: {
        isWorkerMode: parseBoolean(isWorkerMode),
      },
      create: {
        userId: user.id,
        isWorkerMode: parseBoolean(isWorkerMode),
      },
    });

    const { passwordHash, ...safeUser } = user;

    // Add explicit mode field for frontend
    const mode = safeUser.role === 'CLIENT' 
      ? 'client' 
      : (profile.isWorkerMode === true ? 'worker' : 'client');

    res.json({
      message: 'Mode technicien mis à jour avec succès',
      user: {
        ...safeUser,
        TechnicianProfile: profile,
        mode,
      },
      technicianProfile: profile,
    });
  } catch (error) {
    next(error);
  }
};

const updateProfilePicture = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'profilePicture file is required' });
    }

    // CloudinaryStorage sets file.path to the hosted URL
    const profilePictureUrl = req.file.path;

    // Update User table first
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        profilePicture: profilePictureUrl,
      },
    });

    // Check if user has a TechnicianProfile and update it too
    if (updatedUser.role === 'TECHNICIAN') {
      await prisma.technicianProfile.update({
        where: { userId: req.user.id },
        data: {
          profilePicture: profilePictureUrl,
        },
      });
    }

    // Get refreshed user with TechnicianProfile for response
    const refreshedUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        TechnicianProfile: true,
      },
    });

    const { passwordHash, ...safeUser } = refreshedUser;

    // Add explicit mode field for frontend
    const mode = safeUser.role === 'CLIENT' 
      ? 'client' 
      : (safeUser.TechnicianProfile?.isWorkerMode === true ? 'worker' : 'client');

    res.json({
      message: 'Photo de profil mise à jour avec succès',
      user: {
        ...safeUser,
        mode,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, me, promoteToTechnician, setTechnicianMode, updateProfilePicture };
