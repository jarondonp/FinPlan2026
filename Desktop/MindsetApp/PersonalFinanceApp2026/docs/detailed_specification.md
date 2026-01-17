# Especificación Técnica: Mejoras en Presupuesto y Comparación Híbrida

Este documento detalla los requerimientos y la estrategia técnica para la siguiente fase de desarrollo del módulo de Presupuesto Híbrido.

---

## 1. Valores Negativos en Editor (Ajustes)

### Requerimiento
Permitir a los usuarios ingresar montos negativos en el `InlineItemEditor`.
*   **Caso de uso:** Descuentos, reembolsos, correcciones de errores, ajustes a la baja.

### Estrategia Técnica
*   **Componente:** `src/components/budget/InlineItemEditor.tsx`
*   **Cambio:** 
    *   Eliminar el atributo `min="0"` del input de tipo `number`.
    *   Actualizar la validación `validItems` para permitir `item.amount < 0` (mientras no sea 0 o NaN).
    *   Asegurar que `budgetType` 'variable' soporte sumas algebraicas (ya implementado por `reduce`).

---

## 2. "Extras" para Metas de Ahorro y Deuda

### Requerimiento
Permitir agregar ajustes manuales variables (positivos o negativos) a las secciones de "Metas de Ahorro" y "Servicio de Deuda", similar a las categorías de gastos.
*   **Caso de uso:** "Este mes abono $50 extra a la deuda" o "Saco $20 de la meta de viaje".

### Estrategia Técnica

#### A. Persistencia (Backend)
No modificaremos las colecciones `goals` o `accounts`. Usaremos el documento monolítico mensual (`monthly_budgets`) para guardar estos ajustes, manteniendo la lógica centralizada.
*   **Path:** `users/{uid}/monthly_budgets/{SCOPE}_{YYYY-MM}`
*   **Estructura:**
    ```json
    {
      "categories": {
        "Servicio de Deuda": { 
            "variable": 50, 
            "details": { "variable": [{ "name": "Abono extra bono", "amount": 50 }] } 
        },
        "Metas de Patrimonio": { // O desglose por meta individual si es necesario
            "variable": 20,
            "details": { "variable": [{ "name": "Aporte extra", "amount": 20 }] }
        }
      }
    }
    ```

#### B. Componentes (Frontend)
1.  **`BudgetModule.tsx`**:
    *   Actualizar las secciones de renderizado de `Metas de Patrimonio` y `Servicio de Deuda`.
    *   Integrar instáncias de `BudgetCategoryRow` (o una lógica similar simplificada) para estas secciones especiales, conectandolas al `handleSaveItemsWithTracking`.
    *   Para **Deuda**: Mostrar el "Total Planificado" (Mínimos + Extra Config) y permitir sumar el "Variable" (Ajustes del mes).
    *   Para **Metas**: Mostrar el "Total Planificado" (Cuotas mensuales) y permitir sumar "Variable".

2.  **Visualización**:
    *   El total de la barra de progreso debe ser: `Planificado (Base) + Variable (Extras)`.

---

## 3. Visualización "Planificado vs Real" (Histórico)

### Requerimiento
Una nueva vista o ventana que permita comparar el plan original ("Base") contra la ejecución real ("Real") para el mes actual y meses anteriores.

### Conceptos Clave
*   **Presupuesto Base (Planificado):** Calculado en tiempo de ejecución.
    *   *Fórmula:* `Recurrentes (Activos en ese mes) + Deuda (Planificada) + Metas (Cuotas)`.
*   **Presupuesto Real (Ejecutado):** Datos persistidos.
    *   *Fuente:* Documento `monthly_budgets`. Incluye `fixed` (si se guardó snapshot), `reserved`, y fundamentalmente `variable` (ajustes manuales).

### Estrategia Técnica

#### A. Nueva Vista: `BudgetReviewModal.tsx`
*   Una modal o pantalla completa dedicada a la revisión/auditoría.
*   **Selector de Mes:** Permite navegar a `2025-12`, `2026-01`, etc.

#### B. Lógica de Datos (`HybridBudgetService`)
*   Necesitamos una función `getBudgetComparison(month, scope)` que:
    1.  Calcula el **Base** teórico para ese mes (usando la configuración vigente histórica o snapshot si existiera). *Nota: Para simplificar, usaremos la configuración actual proyectada al pasado o snapshots si decidimos implementarlos en `monthly_budgets`.* 
    2.  Lee el **Real** del documento `monthly_budgets/{SCOPE}_{YYYY-MM}`.
    3.  Retorna un objeto pareado:
        ```typescript
        interface BudgetComparison {
            category: string;
            planned: number; // Base
            real: number;    // Base + Variables Manuales
            difference: number; // Real - Planned
            status: 'UNDER' | 'OVER' | 'MATCH';
        }
        ```

#### C. Interfaz de Usuario (Visualización "Lado a Lado")
*   **Filosofía:** No intentar emparejar items automáticamente (evitar errores de adivinanza). Mostrar listas paralelas para auditoría manual.
*   **Tabla de Auditoría (Ej: Para categoría "Comida"):**
    ```text
    | COLUMNA IZQUIERDA (PLANIFICADO) | COLUMNA DERECHA (REAL) |
    | ------------------------------- | ---------------------- |
    | 1. Supermercado... $300         | 1. Super...     $350   |
    | 2. Restaurantes... $100         | 2. Rest...      $200   |
    |                                 | 3. Extra...     $ 50   |
    | ------------------------------- | ---------------------- |
    | TOTAL BASE:        $400         | TOTAL REAL:     $600   |
    ```

#### D. Tipos de Comparación
1.  **Auditoría del Mes (Intra-Mes):** `Planificado (Recurrentes + Deuda)` vs `Real (Ejecutado)`.
    *   *Objetivo:* Ver si cumpliste tu plan este mes.
2.  **Tendencia Histórica (Inter-Mes):** `Real (Mes A)` vs `Real (Mes B)`.
    *   *Objetivo:* Ver evolución del gasto real. "Gasté $50 más en comida que el mes pasado".
    *   *Nota:* Aquí NO participa el "Planificado", solo lo ejecutado final.

### Plan de Implementación
1.  **Fase 1:** Habilitar negativos en `InlineItemEditor` (Rápido).
2.  **Fase 2:** Integrar editor de variables en bloques de Deuda y Metas en `BudgetModule`.
3.  **Fase 3:** Crear `BudgetReviewModal` y lógica de comparación.

---
**Nota sobre Estabilidad:**
Esta arquitectura evita la corrupción de datos porque **nunca** modificamos el "Plan Base" retroactivamente. Si el usuario cambia una suscripción hoy, el "Plan Base" de meses anteriores podría cambiar si no usamos snapshots, pero el "Real" (lo que pagó) queda inmutable en el historial `monthly_budgets`. Esta separación es robusta.
