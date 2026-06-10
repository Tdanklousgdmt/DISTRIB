// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title DistribRegistry — registre d'états des projets musicaux DISTRIB
///
/// NON-NÉGO #2 (doc master) : contrat minimal. Pas de gestion de fonds, pas de
/// tokens, pas de paiements on-chain — uniquement des états et des booléens.
/// Surface STRICTEMENT limitée à 5 fonctions : registerProject, approveVersion,
/// canPublish, setPendingClaim, resolveClaim. RIEN d'autre (pas même de getter
/// additionnel : les events sont la source d'audit publique).
///
/// NON-NÉGO #5 : seul le wallet serveur DISTRIB (owner) écrit ici. Les artistes
/// n'interagissent jamais directement avec le contrat.
contract DistribRegistry is Ownable, ReentrancyGuard {
    struct Project {
        bool exists;
        bool pendingClaim;
        uint256 approvedVersionCount;
    }

    // projectId = keccak256(cuid du projet en base) — calculé côté serveur.
    mapping(bytes32 projectId => Project) private _projects;
    // Hash de version (keccak256 des SHA-256 de fichiers triés), par numéro.
    mapping(bytes32 projectId => mapping(uint256 versionNumber => bytes32))
        private _versionHashes;

    event ProjectRegistered(bytes32 indexed projectId);
    event VersionApproved(
        bytes32 indexed projectId,
        uint256 indexed versionNumber,
        bytes32 versionHash
    );
    event ClaimSet(bytes32 indexed projectId);
    event ClaimResolved(bytes32 indexed projectId);

    error ProjectAlreadyRegistered(bytes32 projectId);
    error ProjectNotRegistered(bytes32 projectId);
    error VersionAlreadyApproved(bytes32 projectId, uint256 versionNumber);
    error InvalidVersionHash();
    error ClaimAlreadyPending(bytes32 projectId);
    error NoPendingClaim(bytes32 projectId);

    constructor() Ownable(msg.sender) {}

    /// Enregistre un projet. Une seule fois par projectId.
    function registerProject(bytes32 projectId) external onlyOwner nonReentrant {
        if (_projects[projectId].exists) {
            revert ProjectAlreadyRegistered(projectId);
        }
        _projects[projectId].exists = true;
        emit ProjectRegistered(projectId);
    }

    /// Ancre l'approbation unanime (vérifiée off-chain) d'une version.
    /// versionHash = keccak256 de la concaténation triée des SHA-256 de fichiers.
    function approveVersion(
        bytes32 projectId,
        uint256 versionNumber,
        bytes32 versionHash
    ) external onlyOwner nonReentrant {
        Project storage project = _projects[projectId];
        if (!project.exists) revert ProjectNotRegistered(projectId);
        if (versionHash == bytes32(0)) revert InvalidVersionHash();
        if (_versionHashes[projectId][versionNumber] != bytes32(0)) {
            revert VersionAlreadyApproved(projectId, versionNumber);
        }
        _versionHashes[projectId][versionNumber] = versionHash;
        unchecked {
            ++project.approvedVersionCount;
        }
        emit VersionApproved(projectId, versionNumber, versionHash);
    }

    /// Le projet est-il publiable ? (au moins une version approuvée, aucune
    /// réclamation en cours). Lecture publique — c'est la source de vérité.
    function canPublish(bytes32 projectId) external view returns (bool) {
        Project storage project = _projects[projectId];
        return
            project.exists &&
            project.approvedVersionCount > 0 &&
            !project.pendingClaim;
    }

    /// Pose une réclamation : bloque la publication jusqu'à résolution.
    function setPendingClaim(bytes32 projectId) external onlyOwner nonReentrant {
        Project storage project = _projects[projectId];
        if (!project.exists) revert ProjectNotRegistered(projectId);
        if (project.pendingClaim) revert ClaimAlreadyPending(projectId);
        project.pendingClaim = true;
        emit ClaimSet(projectId);
    }

    /// Résout la réclamation en cours : débloque la publication.
    function resolveClaim(bytes32 projectId) external onlyOwner nonReentrant {
        Project storage project = _projects[projectId];
        if (!project.exists) revert ProjectNotRegistered(projectId);
        if (!project.pendingClaim) revert NoPendingClaim(projectId);
        project.pendingClaim = false;
        emit ClaimResolved(projectId);
    }
}
