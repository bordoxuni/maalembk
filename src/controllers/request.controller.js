const prisma = require('../config/prisma');
const { getSocketIO } = require('../utils/socketHelper');

const createRequest = async (req, res, next) => {
  try {
    const { categoryId, title, description, budget, latitude, longitude, addressText } = req.body;

    if (!categoryId || !title || !description || !budget || latitude == null || longitude == null) {
      return res.status(400).json({ message: 'Champs obligatoires manquants' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    // Allow both CLIENT and TECHNICIAN roles to create requests
    const canCreateRequest = user.role === 'CLIENT' || user.role === 'TECHNICIAN';

    if (!canCreateRequest) {
      return res.status(403).json({ message: 'Action non autorisée' });
    }

    const category = await prisma.serviceCategory.findUnique({
      where: { id: Number(categoryId) },
    });

    if (!category) {
      return res.status(400).json({ message: 'Catégorie introuvable' });
    }

    // CloudinaryStorage sets file.path to the hosted URL
    const images = req.files ? req.files.map((file) => file.path) : [];

    const newRequest = await prisma.request.create({
      data: {
        clientId: req.user.id,
        categoryId: Number(categoryId),
        title,
        description,
        budget: Number(budget),
        latitude: Number(latitude),
        longitude: Number(longitude),
        addressText,
        images,
      },
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

    // Emit new_request to all technicians
    const io = getSocketIO();
    io.to('technicians').emit('new_request', newRequest);

    res.status(201).json(newRequest);
  } catch (error) {
    next(error);
  }
};

const getMyRequests = async (req, res, next) => {
  try {
    const requests = await prisma.request.findMany({
      where: { clientId: req.user.id },
      include: {
        ServiceCategory: true,
        Offer: {
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
            },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(requests);
  } catch (error) {
    next(error);
  }
};

const getRequestById = async (req, res, next) => {
  try {
    const requestId = Number(req.params.id);

    const request = await prisma.request.findUnique({
      where: { id: requestId },
      include: {
        ServiceCategory: true,
        Offer: {
          include: {
            User: true,
          },
        },
      },
    });

    if (!request) {
      return res.status(404).json({ message: 'Demande introuvable' });
    }

    res.json(request);
  } catch (error) {
    next(error);
  }
};

const cancelRequest = async (req, res, next) => {
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

    const updated = await prisma.request.update({
      where: { id: requestId },
      data: {
        status: 'CANCELLED',
      },
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

    // Emit request_updated to client and all technicians
    const io = getSocketIO();
    io.to(`client:${updated.clientId}`).emit('request_updated', {
      requestId: updated.id,
      status: updated.status
    });
    io.to('technicians').emit('request_updated', {
      requestId: updated.id,
      status: updated.status
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

const deleteRequest = async (req, res, next) => {
  try {
    const requestId = Number(req.params.id);

    const request = await prisma.request.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      return res.status(404).json({ message: 'Demande introuvable' });
    }

    // Only the client who created the request can delete it
    if (request.clientId !== req.user.id) {
      return res.status(403).json({ message: 'Action non autorisée' });
    }

    const deletedRequest = await prisma.request.findUnique({
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

    // Defensive cleanup: ensure related offers are removed even if DB-level cascade isn't enforced.
    // Prevents orphaned offers that can crash technician offer queries.
    await prisma.$transaction([
      prisma.offer.deleteMany({ where: { requestId } }),
      prisma.request.delete({ where: { id: requestId } }),
    ]);

    // Emit request_deleted to client and all technicians
    const io = getSocketIO();
    io.to(`client:${request.clientId}`).emit('request_deleted', {
      requestId: requestId,
      deletedRequest: deletedRequest
    });
    io.to('technicians').emit('request_deleted', {
      requestId: requestId,
      deletedRequest: deletedRequest
    });

    res.json({ message: 'Demande supprimée avec succès' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createRequest,
  getMyRequests,
  getRequestById,
  cancelRequest,
  deleteRequest,
};
