import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth as _getAuth } from 'firebase-admin/auth';

const getAuth = () => {
  if (!getApps().length) {
    try {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      // Replace literal '\n' characters in the env string with actual newlines
      const privateKey = process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;

      if (projectId && clientEmail && privateKey) {
        initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
        console.log('Firebase Admin initialized successfully.');
      } else {
        console.warn('Firebase Admin initialization skipped: Missing credentials in environment variables.');
      }
    } catch (error) {
      console.error('Firebase Admin initialization error', error.stack);
    }
  }
  return _getAuth();
};

export { getAuth };
