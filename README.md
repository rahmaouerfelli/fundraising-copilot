# AI Fundraising Copilot

Assistant de collecte de fonds pour les ONG (développé pour l'association **Arc en Ciel**, Tunisie).
L'application trouve les appels à projets ouverts sur le web, les classe selon le profil de l'ONG
grâce à l'IA, et aide à rédiger les candidatures.

---

## Fonctionnalités

- **Profil d'ONG** : mission, secteurs, bénéficiaires, budget et montants recherchés.
- **Scan des subventions** : Tavily cherche de nouvelles pages d'appels à projets, les pages sont téléchargées,
  puis Mistral en extrait les offres (titre, bailleur, montant, date limite, éligibilité, secteurs).
  Le scan tourne en arrière-plan avec une fenêtre de progression ; seules les offres ouvertes aux ONG
  du pays enregistré sont gardées, et les appels expirés sont fermés automatiquement.
- **AI Matches** : les subventions les plus proches du profil (recherche vectorielle Qdrant),
  notées de 0 à 100 par Mistral avec une explication.
- **All Grants** : toutes les subventions ouvertes, paginées, filtrables par secteur et triables.
- **Recherche** par mots-clés ou en langage naturel (en français ou en anglais).
- **Pipeline** : suivi de chaque candidature (`discovered → saved → preparing → submitted → won / lost`).
- **Rédaction assistée** : brouillon IA de chaque section (résumé, objectifs, impact, activités, budget, indicateurs).
- **Tableau de bord** : indicateurs, taux de réussite et dates limites des 30 prochains jours.
- **Comptes utilisateurs** (JWT) : chaque compte ne voit que les données de son ONG.

## Technologies

| Partie | Technologies |
|---|---|
| Frontend | React 18, Vite, React Router, Axios |
| Backend | FastAPI, SQLAlchemy, SQLite (PostgreSQL possible), APScheduler |
| IA | Mistral AI (`ministral-14b-latest` pour le texte, `mistral-embed` pour les vecteurs) |
| Recherche web | Tavily |
| Base vectorielle | Qdrant, en mode local (aucun serveur ni Docker nécessaire) |

---

## Installation

### Prérequis

- **Python 3.10+** et **Node.js 18+**
- Une clé API **Mistral** : https://console.mistral.ai/
- Une clé API **Tavily** (offre gratuite, sans carte bancaire) : https://tavily.com/

### 1. Récupérer le code

```powershell
git clone https://github.com/rahmaouerfelli/fundraising-copilot.git
cd fundraising-copilot
```

### 2. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate          # macOS / Linux : source .venv/bin/activate
python -m pip install -r requirements.txt
copy ..\.env.example .env         # macOS / Linux : cp ../.env.example .env
```

Ouvrez `backend/.env` et renseignez au minimum `MISTRAL_API_KEY`, `TAVILY_API_KEY` et `SECRET_KEY`
(voir [Variables d'environnement](#variables-denvironnement)), puis lancez le serveur :

```powershell
python -m uvicorn main:app --reload --port 8000
```

- API : http://localhost:8000
- Documentation interactive : http://localhost:8000/docs

La base de données et l'index Qdrant sont créés automatiquement au premier démarrage, dans `backend/data/`.

### 3. Frontend

Dans un second terminal :

```powershell
cd frontend
npm install
npm run dev
```

Ouvrez **http://localhost:5173**.

### 4. Premiers pas

1. Créez un compte, puis remplissez le profil de votre ONG.
2. Sur la page **Discover**, cliquez sur **Scan for Grants** (environ 1 à 2 minutes).
3. Consultez les résultats dans **AI Matches** ou **All Grants**, enregistrez une subvention
   dans le pipeline, puis rédigez la candidature.

---

## Variables d'environnement

Fichier `backend/.env` (modèle : `.env.example`). **Ne le publiez jamais** : il est exclu par `.gitignore`.

| Variable | Rôle | Valeur par défaut |
|---|---|---|
| `MISTRAL_API_KEY` | Clé API Mistral | **obligatoire** |
| `TAVILY_API_KEY` | Clé API Tavily (recherche de nouvelles sources) | **obligatoire** pour le scan |
| `SECRET_KEY` | Clé de signature des jetons de connexion | **à changer** |
| `MISTRAL_MODEL` | Modèle de texte | `ministral-14b-latest` |
| `MISTRAL_EMBED_MODEL` | Modèle d'embeddings | `mistral-embed` |
| `DATABASE_URL` | Base de données | `sqlite:///./data/fundraising_copilot.db` |
| `QDRANT_URL` | `local` (fichiers) ou URL d'un serveur Qdrant | `local` |
| `QDRANT_COLLECTION` | Nom de la collection | `grants` |
| `INGESTION_INTERVAL_HOURS` | Fréquence du scan automatique | `6` |
| `SOURCE_RECRAWL_HOURS` | Délai avant de réanalyser une page déjà traitée | `24` |
| `INGESTION_MAX_SOURCES_PER_CYCLE` | Nombre maximum de pages analysées par scan | `25` |
| `REMINDER_CHECK_INTERVAL_HOURS` | Fréquence de vérification des dates limites | `24` |
| `DEBUG` | Mode debug de FastAPI | `True` |

Pour générer une `SECRET_KEY` :

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## Structure du projet

```
fundraising-copilot/
├── backend/
│   ├── main.py                 # Point d'entrée FastAPI, maintenance au démarrage, planificateur
│   ├── config.py               # Paramètres (lus depuis .env)
│   ├── models/                 # Modèles SQLAlchemy (ONG, utilisateurs, subventions, pipeline…)
│   ├── schemas/                # Schémas Pydantic des requêtes / réponses
│   ├── routers/                # Routes API : auth, ngos, grants, matches, pipeline, applications, dashboard
│   └── services/
│       ├── ingestion_service.py  # Scan : découverte, téléchargement, extraction, indexation
│       ├── mistral_service.py    # Appels Mistral (extraction, notation, rédaction, embeddings)
│       ├── matching_service.py   # AI Matches (recherche vectorielle + notation + cache)
│       ├── search_service.py     # Recherche par mots-clés
│       ├── taxonomy.py           # Liste fixe des secteurs
│       ├── tavily_service.py     # Recherche web
│       ├── qdrant_service.py     # Base vectorielle
│       └── scheduler.py          # Tâches planifiées
└── frontend/
    └── src/
        ├── api/client.js       # Appels à l'API
        ├── pages/              # Accueil, connexion, profil, Discover, Pipeline, candidature, tableau de bord
        ├── components/         # Cartes, fenêtre de scan, toasts, pagination…
        └── hooks/              # Validation du formulaire d'inscription
```

Des notes d'architecture plus détaillées se trouvent dans [`CLAUDE.md`](CLAUDE.md).

---

## Dépannage

| Problème | Solution |
|---|---|
| `pip.exe` ou `uvicorn.exe` « bloqué par une stratégie de contrôle d'application » (Windows) | Utilisez `python -m pip …` et `python -m uvicorn …` |
| `Qdrant … already accessed by another instance` | Un autre backend tourne déjà : arrêtez-le. Le mode local n'accepte qu'un seul processus (pas de `--workers`) |
| Erreurs `429 Rate limit exceeded` de Mistral | Certains modèles n'ont aucun quota sur les comptes gratuits. Gardez `MISTRAL_MODEL=ministral-14b-latest` ; l'application bascule aussi seule sur `ministral-8b-latest` puis `ministral-3b-latest` |
| Le scan trouve 0 subvention | Les pages déjà analysées et inchangées sont ignorées pendant 24 h. Le message de fin indique le nombre de pages illisibles ou reportées |
| Une page affiche « Not authenticated » | La session (7 jours) a expiré : reconnectez-vous |

---

## Sécurité

- Les clés API et la `SECRET_KEY` restent dans `backend/.env`, qui n'est jamais publié.
- La base de données (e-mails et mots de passe chiffrés des utilisateurs) n'est pas versionnée.
- Toutes les routes, sauf l'inscription et la connexion, exigent d'être connecté.
- Le serveur refuse de télécharger des adresses internes ou privées (protection SSRF).
