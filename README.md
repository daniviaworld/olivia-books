# 📖 Olivia Books

App web instalable (PWA) para que Olivia escriba sus libros y la familia los lea desde cualquier dispositivo.

**Qué hace**
- **Pasar a limpio**: Olivia copia su libro (escrito a mano) en la app, todo seguido. Toca donde empieza cada capítulo y pulsa **✂️ Capítulo nuevo aquí**; la app lo parte, le pone nombre y numera. Si se equivoca, **Unir** lo deshace.
- Olivia escribe por capítulos: títulos, subtítulos, negrita/cursiva, listas, citas, alineación, **saltos de página**, **imágenes e ilustraciones** (tamaño pequeño/mediano/grande). Se guarda sola.
- Lector paginado con **número de página**, índice, barra para saltar de página y recuerda por dónde ibas.
- **4 modos**: claro, oscuro, lectura (sepia) y lectura noche (ámbar, sin luz azul). Tamaño y tipo de letra ajustables.
- **Exportar**: PDF, Word (.docx) y ePub. **Compartir**: WhatsApp, Telegram, o cualquier app del móvil.
- **Acceso con Firebase Authentication** (correo + contraseña). Solo Olivia edita; la familia solo lee los libros **publicados** y únicamente cuando Olivia los aprueba.
- Funciona sin conexión una vez abierta (caché de la app y de los datos).

---

## 1. Crear el proyecto Firebase (10 min)

1. Entra en <https://console.firebase.google.com> → **Agregar proyecto** → nombre `olivia-books`.
2. **Compilación → Authentication → Comenzar** y activa solo **Correo electrónico/contraseña**.
   En *Configuración → Dominios autorizados* añade `daniviaworld.github.io`.
3. **Compilación → Firestore Database → Crear base de datos** (modo producción, región `eur3` o `europe-southwest1`).
4. En la pestaña **Reglas** de Firestore pega el contenido de `firestore.rules` y pulsa **Publicar**.
   ⚠️ Antes, cambia el correo `correo-de-olivia@gmail.com` por el de Olivia.
5. **Configuración del proyecto (⚙️) → Tus apps → `</>` Web** → registra la app y copia el bloque `firebaseConfig`.
6. Abre `firebase-config.js`, pega esos valores y escribe el correo de Olivia en `WRITER_EMAIL` (el mismo que en las reglas).

> No hace falta plan de pago: las imágenes se guardan comprimidas dentro de Firestore, así que **no usa Firebase Storage**.

## 2. Subir a GitHub (cuenta `daniviaworld`)

```bash
git init && git add . && git commit -m "Olivia Books"
git branch -M main
git remote add origin https://github.com/daniviaworld/olivia-books.git
git push -u origin main
```

1. En el repositorio: **Settings → Pages → Source: GitHub Actions**.
2. Al terminar el workflow *Publicar web*, la app estará en `https://daniviaworld.github.io/olivia-books/`.
3. Para publicar un **Release** (zip descargable de la app):
   ```bash
   git tag v1.0.0 && git push origin v1.0.0
   ```
   El workflow *Crear Release* adjunta `olivia-books-v1.0.0.zip` en la pestaña **Releases**.

## 3. Primer uso

1. Abre la web, pulsa **Registrarme** con **daniviaworld@gmail.com** y una contraseña, y verifica el correo → esa cuenta es la escritora (Olivia la usa en su móvil/tablet).
2. **Nuevo libro** → escribe → en **⚙️ Ajustes del libro** marca *Publicado* cuando quiera que la familia lo vea.
3. La familia abre el enlace, se registra y verifica su correo. Olivia los aprueba en **👤 → Familia y accesos**.
4. En móvil: menú del navegador → **Instalar app / Añadir a pantalla de inicio**.

## Notas

- **PDF**: se genera con el diálogo de impresión del navegador → elige *Guardar como PDF*. Los números de página salen en Chrome, Edge y Android. En Safari/iPhone el PDF sale sin número (Word y ePub sí los respetan).
- **Compartir**: WhatsApp/Telegram envían el *enlace* al libro; quien lo reciba debe estar registrado y aprobado. También se puede enviar el libro como archivo ePub.
- **Imágenes**: se comprimen automáticamente (máx. 1200 px). Un libro con muchas ilustraciones carga más despacio la primera vez.
- Cada libro, capítulo e imagen es un documento de Firestore, dentro de la cuota gratuita para uso familiar.
