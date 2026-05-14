const prisma = require('../src/config/prisma');

const categories = [
  { name: 'Réparation', description: 'Interventions de réparation générale' },
  { name: 'Électricité', description: 'Travaux électriques et dépannage' },
  { name: 'Climatisation', description: 'Installation et maintenance de climatisation' },
  { name: 'Plomberie', description: 'Installation et réparation de plomberie' },
  { name: 'Nettoyage', description: 'Nettoyage résidentiel et professionnel' },
  { name: 'Menuiserie', description: 'Travaux de menuiserie et bois' },
  { name: 'Peinture', description: 'Peinture intérieure et extérieure' },
  { name: 'Jardinage', description: 'Entretien et aménagement des espaces verts' },
];

async function main() {
  for (const category of categories) {
    await prisma.serviceCategory.upsert({
      where: { name: category.name },
      update: {
        description: category.description,
      },
      create: category,
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
