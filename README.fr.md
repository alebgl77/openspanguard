# OpenSpanGuard

**Make AI quality observable. — Rendez la qualité de vos IA observable.**

[![CI](https://github.com/alebgl77/openspanguard/actions/workflows/ci.yaml/badge.svg)](https://github.com/alebgl77/openspanguard/actions/workflows/ci.yaml)
[![Licence](https://img.shields.io/github/license/alebgl77/openspanguard)](LICENSE)
[![Dernière version](https://img.shields.io/github/v/release/alebgl77/openspanguard?include_prereleases&label=release)](https://github.com/alebgl77/openspanguard/releases)

OpenSpanGuard ajoute des signaux de qualité à vos traces IA d'origine. Cette **passerelle d'enrichissement OTLP/HTTP JSON** évalue les spans de génération terminés, conserve leurs identifiants et horodatages, puis expose la couverture d'évaluation et la pertinence dans Prometheus et Grafana.

**Developer Preview · Apache-2.0 · Node.js 22 / 24 testés · Validation canary avant production**

**[Essayer la démo ↓](#essayer-la-démo)** · [Guide d'intégration](docs/integration.md) · [Site](https://alebgl77.github.io/openspanguard/) · [English](README.md)

![OpenSpanGuard relie les signaux de qualité à la trace IA d'origine et à votre supervision.](docs/assets/openspanguard-hero.png)

[Démo](#essayer-la-démo) · [Docker](#lancer-la-stack-locale) · [Intégration](#intégrer-une-application) · [Signaux et limites](#lire-les-signaux) · [Documentation](#documentation-et-communauté)

## Essayer la démo

Avec Node.js 22 ou 24 et npm :

```sh
git clone https://github.com/alebgl77/openspanguard.git
cd openspanguard
npm ci
npm run build
npm run demo
```

Après installation des dépendances, la démo utilise des services en boucle locale, sans clé de fournisseur ni Docker. Elle vérifie les identifiants et horodatages, la suppression des évaluations répétées pendant la fenêtre de cache, les spans sans contenu, la suppression des champs de contenu reconnus et l'exporteur OpenTelemetry JSON. Le JSON final contient `"result": "pass"`. **Tous les scores de démo sont synthétiques.**

Si PowerShell bloque `npm.ps1`, utilisez `npm.cmd` avec les mêmes arguments.

## Lancer la stack locale

Avec Docker Engine, Docker Compose et Node.js, depuis le dépôt cloné :

```sh
docker compose up --build -d --wait
node examples/stack-smoke.mjs
node examples/send-demo.mjs 180
```

Ouvrez [Grafana](http://127.0.0.1:3000/d/openspanguard/openspanguard). Trois minutes de trafic synthétique alimentent les panneaux de pertinence, confiance, couverture et santé de l'export. Le smoke test vérifie une trace dans Tempo et le routage d'une alerte synthétique vers le webhook local.

Les ports sont limités à la boucle locale, Grafana est en lecture seule anonyme et Tempo utilise un stockage éphémère. Arrêtez avec `docker compose down`. Voir le [déploiement](docs/deployment.md) pour les données persistantes et le nettoyage.

## Intégrer une application

Utilisez `OTLPTraceExporter` de `@opentelemetry/exporter-trace-otlp-http` dans le `BatchSpanProcessor` de votre provider existant, avec `http://127.0.0.1:4318/v1/traces`. Le transport accepté est **HTTP/JSON** ; l'exporteur `-proto` reçoit une réponse HTTP 415.

Le helper SDK se trouve dans les sources du dépôt ; ce preview ne propose pas d'installation npm publiée. Appelez `annotateGeneration` avant `span.end()` pour capturer explicitement prompt, réponse et contexte facultatif. L'[exemple SDK](examples/sdk.ts) montre aussi l'accumulation d'un flux. Avec la passerelle démarrée, lancez `npx tsx examples/sdk.ts`.

Avec l'export asynchrone par lots, l'évaluation intervient après la génération. L'export et le flush attendent néanmoins l'évaluation et la livraison. Voir le [guide d'intégration](docs/integration.md) pour le cycle de vie et l'authentification.

Pour passer de la stack Docker complète à une passerelle lancée sur la machine hôte, arrêtez la stack avec `docker compose down` afin de libérer le port 4318, puis redémarrez uniquement collector/Tempo selon les instructions liées ci-dessous. Le mode Jev exige `OSG_JEV_API_KEY` et `OSG_ALLOW_REMOTE_CONTENT=true`. Il envoie le contenu capturé au service d'évaluation **avant** sa suppression des traces transmises au collector ; des frais fournisseur peuvent s'appliquer. Suivez les commandes [POSIX](README.md#enable-live-jev-evaluation) ou [PowerShell](docs/integration.md#jev-in-powershell). `.env.example` documente la configuration mais n'est pas chargé automatiquement.

## Lire les signaux

| Signal | Signification |
| --- | --- |
| Pertinence | Résultat ordinal de 0 à 4, normalisé entre 0 et 1 |
| Confiance | Confiance de l'évaluateur dans sa décision de pertinence |
| Probabilité de non-sens | Résultat `noul` pour la question précise de ce projet |
| Couverture | Évaluations réussies à la première observation / spans de génération observés pour la première fois, dans la fenêtre locale |

Ces signaux ne prouvent pas l'exactitude d'une réponse. La probabilité de non-sens n'est pas une probabilité générale d'hallucination. Les évaluations manquantes et les timeouts restent visibles. La métrique retient le premier résultat observé pour chaque identité : un retry réussi ne corrige pas ce résultat tant que la fenêtre de déduplication des métriques le supprime. Calibrez les alertes sur des exemples représentatifs annotés avant de les utiliser pour déclencher une intervention.

![Les spans JSON terminés passent par l'évaluation bornée, la suppression du contenu reconnu, le collector et Tempo ; Prometheus collecte les métriques et Grafana interroge les deux sources.](docs/assets/architecture.png)

Le contenu capturé peut transiter par Jev sur consentement explicite. Seuls les champs reconnus sont supprimés : des données sensibles dans des attributs personnalisés peuvent rester. Le cache est borné et local au processus, sans file persistante ni garantie globale de traitement unique. L'événement de compatibilité `gen_ai.evaluation.result` n'est pas un LogRecord standard émis. Voir les [limites de mesure](docs/measurement.md), l'[architecture](docs/architecture.md) et la [checklist de production](docs/production-checklist.md).

## Documentation et communauté

La documentation technique de référence est en anglais : [intégration](docs/integration.md), [configuration](docs/configuration.md), [FAQ](docs/faq.md), [dépannage](docs/troubleshooting.md), [support](SUPPORT.md) et [feuille de route](docs/roadmap.md).

Partagez un retour dans les [Discussions](https://github.com/alebgl77/openspanguard/discussions) ou consultez le guide [Contribuer](CONTRIBUTING.md). Le [kit de lancement](docs/launch-kit.md) propose des textes FR/EN et le [kit média](docs/media-kit.md) rassemble les visuels.

Projet indépendant, sans affiliation officielle ni soutien revendiqué d'OpenTelemetry, Grafana ou Jev. [Licence Apache-2.0](LICENSE) · [Sécurité](SECURITY.md) · [Code de conduite](CODE_OF_CONDUCT.md).

## Auteur

Conçu et maintenu par **[Alexandre Beguel](https://github.com/alebgl77)**, architecte IA agentique et CAIO externalisé basé à Paris. Il travaille sur l'IA générative en production, le LLMOps, le FinOps des LLM et la gouvernance de l'IA fondée sur les preuves. [beguel.com](https://beguel.com/) · [LinkedIn](https://www.linkedin.com/in/beguel/) · [Profil en français, anglais et espagnol](https://alebgl77.github.io/fr/)
