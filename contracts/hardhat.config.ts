import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

// ─────────────────────────────────────────────────────────────────────────────
// DISTRIB — config Hardhat 3.
//
// NON-NÉGO #3 : déployer d'abord sur `amoy` (testnet) et y rester AU MOINS
// 2 semaines. Si un seul test échoue ou si un comportement testnet est
// inattendu — même bénin — ne PAS déployer sur `polygon` (mainnet).
//
// Les variables (RPC, clé du wallet serveur) sont résolues paresseusement via
// configVariable : compiler et tester ne requièrent aucun secret.
// ─────────────────────────────────────────────────────────────────────────────

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
    },
  },
  networks: {
    // Réseau simulé local (tests).
    hardhatLocal: {
      type: "edr-simulated",
      chainType: "l1",
    },
    // Polygon Amoy — testnet. Étape obligatoire.
    amoy: {
      type: "http",
      chainType: "generic",
      url: configVariable("ALCHEMY_RPC_URL_AMOY"),
      accounts: [configVariable("SERVER_WALLET_PRIVATE_KEY")],
    },
    // Polygon mainnet — UNIQUEMENT après 2 semaines de testnet sans anomalie.
    polygon: {
      type: "http",
      chainType: "generic",
      url: configVariable("ALCHEMY_RPC_URL_MAINNET"),
      accounts: [configVariable("SERVER_WALLET_PRIVATE_KEY")],
    },
  },
});
