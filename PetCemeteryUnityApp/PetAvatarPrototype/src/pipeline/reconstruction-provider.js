export class ReconstructionProvider {
  get name() {
    throw new Error("ReconstructionProvider.name must be implemented");
  }

  async reconstruct(_request) {
    throw new Error("ReconstructionProvider.reconstruct must be implemented");
  }
}
