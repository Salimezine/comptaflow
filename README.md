# ComptaFlow - Generateur d'Ecritures Comptables IA

Plateforme web permettant de transformer un dossier complet de pieces justificatives (PDF) en ecritures comptables pretes a l'import, conforme au Systeme Comptable des Entreprises tunisiennes (SCE 1996).

## Architecture

```
eurex/
  api/          # Cloudflare Workers (Backend)
    src/
      worker.ts          # Entry point
      router.ts          # Route dispatcher
      types.ts           # TypeScript types
      utils.ts           # Helper functions
      routes/
        societes.ts      # CRUD societes
        journaux.ts      # CRUD journaux
        plans_comptes.ts # Plan de comptes
        dossiers.ts      # Gestion des dossiers
        pieces.ts        # Upload PDF + extraction IA
        ecritures.ts     # Generation d'ecritures
        anomalies.ts     # Detection d'anomalies
        export.ts        # Export CSV
        dashboard.ts     # Statistiques
    migrations/
      0001_init.sql      # Schema D1
  web/          # React + Vite + Tailwind (Frontend)
    src/
      App.tsx            # Router principal
      pages/
        Dashboard.tsx        # Ecran tableau de bord
        NewDossier.tsx       # Import d'un nouveau dossier
        ControleDonnees.tsx  # Controle des donnees extraites
        EcrituresPage.tsx    # Ecritures generees
        Parametres.tsx       # Parametres societe/journaux/plan
      lib/
        api.ts           # Client API
```

## Stack technique

- **Backend**: Cloudflare Workers + D1 (SQLite) + R2 (stockage PDF)
- **Frontend**: React 19 + Vite + Tailwind CSS
- **IA**: Claude API (Anthropic) pour extraction PDF et generation d'ecritures
- **Format export**: CSV conforme au module d'import existant

## Pre-requis

- Node.js 18+
- Compte Cloudflare (gratuit)
- Cle API Anthropic (Claude)

## Installation

### 1. Backend (API)

```bash
cd api
npm install

# Creer la base D1
wrangler d1 create comptaflow-db
# Copier l'ID dans wrangler.jsonc

# Creer le bucket R2
wrangler r2 bucket create comptaflow-pdfs

# Initialiser la base
npm run db:init

# Configurer la cle Claude
wrangler secret put CLAUDE_API_KEY

# Lancer en dev
npm run dev
```

### 2. Frontend (Web)

```bash
cd web
npm install
npm run dev
```

Le frontend tourne sur http://localhost:3000 et proxy les appels API vers le Worker.

## Deploiement

```bash
# Backend
cd api
wrangler deploy

# Frontend
cd web
npm run build
wrangler pages deploy dist --project-name comptaflow
```

## Fonctionnalites

1. **Gestion multi-societe**: Creer des societes avec leur plan de comptes et journaux
2. **Upload PDF**: Deposer des factures de vente, d'achat, rapports de vente
3. **Extraction IA**: Claude Vision analyse les PDF et extrait les champs cles
4. **Generation d'ecritures**: Regroupement intelligent par journal, ventilation TVA, gestion timbre
5. **Controle automatique**: Verification Debit = Credit, detection d'anomalies
6. **Edition inline**: Modifier les ecritures avant export
7. **Export CSV**: Format compatible avec le module d'import existant
8. **Historique**: Suivi de tous les dossiers traites

## Format d'export CSV

```
Date operation;Date piece;Journal;N doc comptable;Libelle;Compte;Libelle ligne;Montant debit;Montant credit;Tresorerie;Sens
```

## Regles metier

- Regroupement des ventes "clients de passage" par journee
- Ecriture individuelle pour les clients/fournisseurs nommes
- Ventilation TVA stricte par taux (19%, 7%, 0%)
- Gestion du timbre fiscal (1 DT)
- Controle equilibre Debit/Credit obligatoire
- Detection automatique des anomalies
