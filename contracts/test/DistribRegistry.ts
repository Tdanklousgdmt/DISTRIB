import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

// Identifiants de test : keccak256 de cuids factices (même dérivation que le
// serveur Next — src/lib/blockchain.ts `onchainId`).
const PROJECT_A = ethers.id("cuid_projet_a");
const PROJECT_B = ethers.id("cuid_projet_b");
const HASH_V1 = ethers.id("sha256-fichiers-version-1");
const HASH_V2 = ethers.id("sha256-fichiers-version-2");
const ZERO = ethers.ZeroHash;

async function deploy() {
  const [owner, stranger] = await ethers.getSigners();
  const registry = await ethers.deployContract("DistribRegistry");
  return { registry, owner, stranger };
}

describe("DistribRegistry", function () {
  describe("déploiement", function () {
    it("le déployeur (wallet serveur) est owner", async function () {
      const { registry, owner } = await deploy();
      expect(await registry.owner()).to.equal(owner.address);
    });
  });

  describe("registerProject", function () {
    it("enregistre un projet et émet ProjectRegistered", async function () {
      const { registry } = await deploy();
      await expect(registry.registerProject(PROJECT_A))
        .to.emit(registry, "ProjectRegistered")
        .withArgs(PROJECT_A);
    });

    it("refuse le double enregistrement", async function () {
      const { registry } = await deploy();
      await registry.registerProject(PROJECT_A);
      await expect(registry.registerProject(PROJECT_A))
        .to.be.revertedWithCustomError(registry, "ProjectAlreadyRegistered")
        .withArgs(PROJECT_A);
    });

    it("refuse un appelant non-owner", async function () {
      const { registry, stranger } = await deploy();
      await expect(
        registry.connect(stranger).registerProject(PROJECT_A),
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  describe("approveVersion", function () {
    it("ancre une version et émet VersionApproved", async function () {
      const { registry } = await deploy();
      await registry.registerProject(PROJECT_A);
      await expect(registry.approveVersion(PROJECT_A, 1n, HASH_V1))
        .to.emit(registry, "VersionApproved")
        .withArgs(PROJECT_A, 1n, HASH_V1);
    });

    it("refuse un projet non enregistré", async function () {
      const { registry } = await deploy();
      await expect(registry.approveVersion(PROJECT_A, 1n, HASH_V1))
        .to.be.revertedWithCustomError(registry, "ProjectNotRegistered")
        .withArgs(PROJECT_A);
    });

    it("refuse un hash nul", async function () {
      const { registry } = await deploy();
      await registry.registerProject(PROJECT_A);
      await expect(
        registry.approveVersion(PROJECT_A, 1n, ZERO),
      ).to.be.revertedWithCustomError(registry, "InvalidVersionHash");
    });

    it("refuse d'écraser une version déjà approuvée (immuabilité)", async function () {
      const { registry } = await deploy();
      await registry.registerProject(PROJECT_A);
      await registry.approveVersion(PROJECT_A, 1n, HASH_V1);
      await expect(registry.approveVersion(PROJECT_A, 1n, HASH_V2))
        .to.be.revertedWithCustomError(registry, "VersionAlreadyApproved")
        .withArgs(PROJECT_A, 1n);
    });

    it("accepte plusieurs versions successives", async function () {
      const { registry } = await deploy();
      await registry.registerProject(PROJECT_A);
      await registry.approveVersion(PROJECT_A, 1n, HASH_V1);
      await registry.approveVersion(PROJECT_A, 2n, HASH_V2);
      expect(await registry.canPublish(PROJECT_A)).to.equal(true);
    });

    it("refuse un appelant non-owner", async function () {
      const { registry, stranger } = await deploy();
      await registry.registerProject(PROJECT_A);
      await expect(
        registry.connect(stranger).approveVersion(PROJECT_A, 1n, HASH_V1),
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  describe("canPublish", function () {
    it("false pour un projet inconnu", async function () {
      const { registry } = await deploy();
      expect(await registry.canPublish(PROJECT_A)).to.equal(false);
    });

    it("false sans version approuvée", async function () {
      const { registry } = await deploy();
      await registry.registerProject(PROJECT_A);
      expect(await registry.canPublish(PROJECT_A)).to.equal(false);
    });

    it("true après une version approuvée", async function () {
      const { registry } = await deploy();
      await registry.registerProject(PROJECT_A);
      await registry.approveVersion(PROJECT_A, 1n, HASH_V1);
      expect(await registry.canPublish(PROJECT_A)).to.equal(true);
    });

    it("indépendant entre projets", async function () {
      const { registry } = await deploy();
      await registry.registerProject(PROJECT_A);
      await registry.registerProject(PROJECT_B);
      await registry.approveVersion(PROJECT_A, 1n, HASH_V1);
      expect(await registry.canPublish(PROJECT_A)).to.equal(true);
      expect(await registry.canPublish(PROJECT_B)).to.equal(false);
    });
  });

  describe("setPendingClaim / resolveClaim", function () {
    it("une réclamation bloque la publication, sa résolution la rétablit", async function () {
      const { registry } = await deploy();
      await registry.registerProject(PROJECT_A);
      await registry.approveVersion(PROJECT_A, 1n, HASH_V1);

      await expect(registry.setPendingClaim(PROJECT_A))
        .to.emit(registry, "ClaimSet")
        .withArgs(PROJECT_A);
      expect(await registry.canPublish(PROJECT_A)).to.equal(false);

      await expect(registry.resolveClaim(PROJECT_A))
        .to.emit(registry, "ClaimResolved")
        .withArgs(PROJECT_A);
      expect(await registry.canPublish(PROJECT_A)).to.equal(true);
    });

    it("refuse une réclamation sur projet inconnu", async function () {
      const { registry } = await deploy();
      await expect(registry.setPendingClaim(PROJECT_A))
        .to.be.revertedWithCustomError(registry, "ProjectNotRegistered")
        .withArgs(PROJECT_A);
    });

    it("refuse une double réclamation", async function () {
      const { registry } = await deploy();
      await registry.registerProject(PROJECT_A);
      await registry.setPendingClaim(PROJECT_A);
      await expect(registry.setPendingClaim(PROJECT_A))
        .to.be.revertedWithCustomError(registry, "ClaimAlreadyPending")
        .withArgs(PROJECT_A);
    });

    it("refuse de résoudre sans réclamation en cours", async function () {
      const { registry } = await deploy();
      await registry.registerProject(PROJECT_A);
      await expect(registry.resolveClaim(PROJECT_A))
        .to.be.revertedWithCustomError(registry, "NoPendingClaim")
        .withArgs(PROJECT_A);
    });

    it("refusent les appelants non-owner", async function () {
      const { registry, stranger } = await deploy();
      await registry.registerProject(PROJECT_A);
      await expect(
        registry.connect(stranger).setPendingClaim(PROJECT_A),
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      await expect(
        registry.connect(stranger).resolveClaim(PROJECT_A),
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });
});
