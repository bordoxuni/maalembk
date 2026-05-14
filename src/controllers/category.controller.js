const prisma = require('../config/prisma');

const getCategories = async (req, res, next) => {
  try {
    const categories = await prisma.serviceCategory.findMany({
      orderBy: { name: 'asc' },
    });

    res.json(categories);
  } catch (error) {
    next(error);
  }
};

const getCategoryById = async (req, res, next) => {
  try {
    const categoryId = Number(req.params.id);

    const category = await prisma.serviceCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return res.status(404).json({ message: 'Catégorie introuvable' });
    }

    res.json(category);
  } catch (error) {
    next(error);
  }
};

module.exports = { getCategories, getCategoryById };
