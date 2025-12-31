# MANUAL TÉCNICO DE OPERACIÓN - FinMap 2026

Este documento detalla el procedimiento estándar para operar, desarrollar y mantener la aplicación FinMap (FinPlan2026). Está diseñado para que cualquier desarrollador o usuario avanzado pueda retomar el proyecto desde cero.

---

## 1. Información del Repositorio

*   **Nombre del Proyecto:** FinPlan2026 (FinMap Personal AI)
*   **Plataforma:** GitHub
*   **URL del Repositorio:** `https://github.com/jarondonp/FinPlan2026.git`
*   **Rama Principal:** `main`
*   **Tecnologías:** React, TypeScript, Vite, TailwindCSS, Dexie.js (IndexedDB).

---

## 2. Requerimientos Previos

Antes de iniciar, asegúrate de tener instalado en tu computador:

1.  **Node.js (Versión 18 o superior):**
    *   Descargar desde: [nodejs.org](https://nodejs.org/)
    *   Verificar instalación abriendo una terminal y escribiendo: `node -v`
2.  **Git:**
    *   Descargar desde: [git-scm.com](https://git-scm.com/)
    *   Verificar instalación escribiendo: `git --version`
3.  **Editor de Código:** Se recomienda [Visual Studio Code](https://code.visualstudio.com/).

---

## 3. Procedimiento para Iniciar la Aplicación (Local)

Sigue estos pasos si estás descargando el proyecto por primera vez o si reiniciaste tu PC.

### Paso 3.1: Descargar el Código (Clone)
*(Solo necesario la primera vez)*
Abre tu terminal (PowerShell o CMD) en la carpeta donde quieras guardar el proyecto y ejecuta:

```powershell
git clone https://github.com/jarondonp/FinPlan2026.git
cd FinPlan2026
```

### Paso 3.2: Instalar Dependencias
*(Necesario en la primera vez o si se agregan nuevas librerías)*
Dentro de la carpeta del proyecto, ejecuta:

```powershell
npm install
```

### Paso 3.3: Levantar el Servidor de Desarrollo
Para usar la aplicación, ejecuta:

```powershell
npm run dev
```

Deberías ver un mensaje como este:
`➜  Local:   http://localhost:5173/`

### Paso 3.4: Abrir en el Navegador
1.  Abre tu navegador (Chrome recomendado).
2.  Escribe en la barra de direcciones: `http://localhost:5173`
3.  ¡Listo! La aplicación cargará con tus datos locales.

---

## 4. Flujo de Trabajo en Git (Guardar Cambios)

Sigue estas reglas estrictas para subir cambios a la nube sin romper nada ni exponer datos.

### Regla de Oro: PRIVACIDAD
**NUNCA** elimines las reglas del archivo `.gitignore`. Este archivo bloquea automáticamente la subida de:
*   Extractos bancarios (`.csv`, `.xls`)
*   Variables de entorno (`.env`)
*   Backups de base de datos (`.json`)

### Procedimiento de Push (Subida estándar)

Cuando hayas terminado una sesión de trabajo y quieras guardar tu progreso:

1.  **Verificar estado:**
    ```powershell
    git status
    ```
    *Asegúrate de que solo aparezcan en verde archivos de código (.ts, .tsx, .css). Si ves un archivo personal, detente y revisa el .gitignore.*

2.  **Preparar archivos (Stage):**
    ```powershell
    git add .
    ```

3.  **Confirmar cambios (Commit):**
    Usa un mensaje descriptivo entre comillas.
    ```powershell
    git commit -m "Descripción breve de lo que hiciste (ej. Agregado reporte de cashflow)"
    ```

4.  **Enviar a la nube (Push):**
    ```powershell
    git push origin main
    ```

### ¿Qué hacer si hay conflicto? (Error al subir)
Si trabajaste desde otra PC y te sale un error al hacer push, primero debes bajar los cambios más recientes:

```powershell
git pull origin main
```
Luego intenta hacer el push nuevamente.

---

## 5. Estructura de Carpetas Clave

Para orientarte rápido en el código:

*   **`src/components`**: Aquí están las pantallas (Dashboard, Budget, Importer).
*   **`src/db`**: Configuración de la base de datos local (Dexie).
*   **`src/utils`**: Lógica matemática pura (Cálculos de interés, parsers de CSV).
*   **`src/types`**: Definiciones de datos (Qué es una "Cuenta", qué es una "Transacción").

---

## 6. Soporte / Dudas

Si la aplicación no carga:
1.  Revisa que la terminal donde ejecutaste `npm run dev` siga abierta y sin errores rojos.
2.  Intenta borrar la carpeta `node_modules` y ejecutar `npm install` de nuevo.
