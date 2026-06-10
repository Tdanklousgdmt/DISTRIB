import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Déploiement du registre DISTRIB.
//
//   Testnet (étape OBLIGATOIRE, 2 semaines min — non-négo #3) :
//     npx hardhat ignition deploy ignition/modules/DistribRegistry.ts --network amoy
//
//   Mainnet (UNIQUEMENT après 2 semaines Amoy sans la moindre anomalie) :
//     npx hardhat ignition deploy ignition/modules/DistribRegistry.ts --network polygon
//
// Reporter ensuite l'adresse dans MASTER_CONTRACT_ADDRESS (.env.local de l'app).
export default buildModule("DistribRegistryModule", (m) => {
  const registry = m.contract("DistribRegistry");
  return { registry };
});
