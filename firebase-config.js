// ============================================================
//  CONFIGURACIÓN DE OLIVIA BOOKS
//  1) Crea el proyecto en https://console.firebase.google.com
//  2) Añade una app Web y copia aquí los valores de firebaseConfig
//  3) Pon el correo de Olivia (la escritora) en WRITER_EMAIL
//     El MISMO correo debe ir en firestore.rules (ver README.md)
// ============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyB2XXcLqf7HZooVi5OGB4e124AX-zd5se4",
  authDomain: "olivia-books.firebaseapp.com",
  projectId: "olivia-books",
  storageBucket: "olivia-books.firebasestorage.app",
  messagingSenderId: "2073109096",
  appId: "1:2073109096:web:fea820ce5800d22443d1dd"
};

// Único correo con permiso de edición (la escritora)
export const WRITER_EMAIL = "daniviaworld@gmail.com";
