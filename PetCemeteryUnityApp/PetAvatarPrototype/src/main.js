import { createPrototypeServer } from "./server.js";

const { server, config, provider } = await createPrototypeServer();

server.listen(config.port, config.host, () => {
  console.log(`Pet Avatar Prototype: http://${config.host}:${config.port}`);
  console.log(`Reconstruction provider: ${provider.name}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
