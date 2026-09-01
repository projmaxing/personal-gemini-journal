# Production Deployment & Google Cloud Secret Manager Guide

This document outlines how **Personal Gemini Journal** obtains its Gemini AI credentials securely via **Google Cloud Secret Manager** and integrates with Cloud Run and Firebase.

---

## 1. Google Cloud Secret Manager Setup

The Gemini API key is managed as a centralized secret in Google Cloud Secret Manager. It is **never** committed to source code, embedded in client bundles, or stored in static files.

### Step 1: Create the Secret in Secret Manager
```bash
# Enable Secret Manager API
gcloud services enable secretmanager.googleapis.com

# Create the secret definition
gcloud secrets create GEMINI_API_KEY \
  --replication-policy="automatic" \
  --labels="app=personal-gemini-journal,environment=production"

# Add the secret version containing your Gemini API key
echo -n "AIzaSy..." | gcloud secrets versions add GEMINI_API_KEY --data-file=-
```

---

## 2. Cloud Run Service Account & Least-Privilege IAM

The production Cloud Run service runs under a dedicated, least-privileged service account with **Secret Accessor** access strictly scoped to the `GEMINI_API_KEY` secret.

### Step 2: Grant `roles/secretmanager.secretAccessor`
```bash
# Define project and service account variables
PROJECT_ID="ai-studio-personalgeminijo-562521d0-4078-458a-9613-4bc1969def3e"
SERVICE_ACCOUNT="personal-journal-backend@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant Secret Manager Secret Accessor role specifically on the GEMINI_API_KEY secret
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 3. Cloud Run Deployment with Secret Injection

Cloud Run automatically fetches the secret version at container startup and securely injects it into the server environment variable `GEMINI_API_KEY`.

### Step 3: Deploy to Cloud Run
```bash
gcloud run deploy personal-gemini-journal \
  --project="${PROJECT_ID}" \
  --region="asia-southeast1" \
  --service-account="${SERVICE_ACCOUNT}" \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --port=3000 \
  --allow-unauthenticated
```

---

## 4. Production Security Architecture Summary

| Layer | Enforcement Mechanism | Security Guarantee |
|---|---|---|
| **Secret Management** | Google Cloud Secret Manager (`GEMINI_API_KEY:latest`) | Zero hardcoded keys in source or client assets. Injected only into backend memory. |
| **IAM Access** | `roles/secretmanager.secretAccessor` | Least-privilege bound strictly to the runtime service account. |
| **Authentication** | Google Public JWKS (`authenticateFirebaseUser`) | Cryptographic verification of Firebase ID token. Rejects all unauthenticated or spoofed requests. |
| **Authorization** | Server-Side Firestore scoping (`users/{verifiedUid}/*`) | Server queries only records owned by `req.user.uid`. Client cannot request another user's documents. |
| **Database Rules** | `firestore.rules` | Deny-by-default on all root paths; granular `request.auth.uid == userId` checks. |
| **Error Handling** | Sanitized API Responses | Stack traces, database paths, and secrets are strictly stripped before returning responses. |
