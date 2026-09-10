const { createApp } = require('./src/app');

const PORT = Number(process.env.PORT || 3030);
const application = createApp();

if (require.main === module) {
  application.app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = {
  app: application.app,
  repository: application.repository,
  queue: application.repository.queue || [],
};
