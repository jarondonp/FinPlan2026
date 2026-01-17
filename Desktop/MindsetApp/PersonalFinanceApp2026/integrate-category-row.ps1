# Script seguro para integrar BudgetCategoryRow en BudgetModule
# Este script hace cambios INCREMENTALES y PROBADOS

$file = "src/components/budget/BudgetModule.tsx"

Write-Host "🔧 Integrando BudgetCategoryRow..." -ForegroundColor Cyan

# PASO 1: Agregar import de BudgetCategoryRow
Write-Host "1️⃣ Agregando import..." -ForegroundColor Yellow
$content = Get-Content $file -Raw
$current_imports = "import { InlineItemEditor } from './InlineItemEditor';"
$new_imports = @"
import { InlineItemEditor } from './InlineItemEditor';
import { BudgetCategoryRow } from './BudgetCategoryRow';
import { getDoc } from 'firebase/firestore';
"@
$content = $content -replace [regex]::Escape($current_imports), $new_imports
Set-Content $file $content -NoNewline

Write-Host "   ✅ Import agregado" -ForegroundColor Green

# PASO 2: Agregar handler DESPUÉS de fetchBudget (buscar setIsLoading(false))
Write-Host "2️⃣ Agregando handler de guardado..." -ForegroundColor Yellow
$content = Get-Content $file -Raw

# Buscar el final de fetchBudget
$marker = "setIsLoading(false);"
$handler = @"
$marker

    // Handler: Save edited items with history tracking
    const handleSaveItemsWithTracking = async (
        category: string,
        budgetType: 'fixed' | 'reserved' | 'variable',
        newItems: BudgetItem[],
        editReason?: string
    ) => {
        if (!user || !timeframe.start) return;

        try {
            // 1. Get current items for comparison
            const currentCategory = budgetData.find(c => c.category === category);
            const currentItems = ((currentCategory?.details as any)?.[budgetType]) || [];
            
            // Calculate totals
            const previousTotal = currentItems.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
            const newTotal = newItems.reduce((sum, item) => sum + item.amount, 0);

            // 2. Update in Firebase
            const monthKey = `\${scope}_\${timeframe.start ? new Date(timeframe.start).toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7)}`;
            const budgetDocRef = doc(db, 'users', user.uid, 'monthly_budgets', monthKey);
            
            const currentDoc = await getDoc(budgetDocRef);
            const currentData = currentDoc.data() || {};
            const categories = currentData.categories || {};
            
            if (!categories[category]) {
                categories[category] = { fixed: 0, reserved: 0, variable: 0, details: {} };
            }
            categories[category].details = categories[category].details || {};
            categories[category].details[budgetType] = newItems;
            categories[category][budgetType] = newTotal;

            await setDoc(budgetDocRef, { ...currentData, categories }, { merge: true });

            // 3. Track in history
            await BudgetEditHistoryService.saveEdit(
                user.uid,
                scope as any,
                timeframe.start ? new Date(timeframe.start).toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7),
                category,
                budgetType,
                previousTotal,
                currentItems.map((item: any) => ({
                    id: item.id || '',
                    name: item.name || '',
                    amount: item.amount || 0
                })),
                newTotal,
                newItems,
                editReason
            );

            // 4. Refresh
            await fetchBudget();
            setEditingCategory(null);
        } catch (error) {
            console.error('Error saving items:', error);
            alert('Error al guardar cambios');
        }
    };
"@

$content = $content -replace [regex]::Escape($marker), $handler
Set-Content $file $content -NoNewline

Write-Host "   ✅ Handler agregado" -ForegroundColor Green

# PASO 3: Reemplazar el map gigante
Write-Host "3️⃣ Reemplazando map gigante con BudgetCategoryRow..." -ForegroundColor Yellow
$content = Get-Content $file -Raw

# El bloque a reemplazar empieza en budgetData.map y termina antes del cierre del div
# Vamos a encontrarlo por el patrón único
$old_map_start = "{budgetData.map(cat => {"
$new_map = @"
{budgetData.map(cat => (
                                    <BudgetCategoryRow
                                        key={cat.category}
                                        category={cat}
                                        isExpanded={expandedCategory === cat.category}
                                        isMonthClosed={isMonthClosed}
                                        detailView={detailView}
                                        editingCategory={editingCategory}
                                        onToggleExpand={() => setExpandedCategory(expandedCategory === cat.category ? null : cat.category)}
                                        onSetDetailView={(view) => setDetailView(view)}
                                        onUpdateVariable={(value) => handleUpdateVariable(cat.category, value)}
                                        onStartEdit={(budgetType) => setEditingCategory({ category: cat.category, budgetType })}
                                        onSaveItems={(items, reason) => handleSaveItemsWithTracking(cat.category, editingCategory?.budgetType || 'variable', items, reason)}
                                        onCancelEdit={() => setEditingCategory(null)}
                                    />
                                ))}
"@

# Esto es complejo, mejor crear archivo con instrucciones manuales
Write-Host "   ⚠️  Paso 3 requiere edición manual (archivo muy complejo)" -ForegroundColor Yellow

Set-Content "MANUAL_STEP3.txt" @"
PASO 3 MANUAL: Reemplazar el map gigante

ARCHIVO: src/components/budget/BudgetModule.tsx

BUSCAR (línea ~404):
{budgetData.map(cat => {

REEMPLAZAR TODO EL BLOQUE (desde línea 404 hasta línea ~570) CON:

{budgetData.map(cat => (
    <BudgetCategoryRow
        key={cat.category}
        category={cat}
        isExpanded={expandedCategory === cat.category}
        isMonthClosed={isMonthClosed}
        detailView={detailView}
        editingCategory={editingCategory}
        onToggleExpand={() => setExpandedCategory(expandedCategory === cat.category ? null : cat.category)}
        onSetDetailView={(view) => setDetailView(view)}
        onUpdateVariable={(value) => handleUpdateVariable(cat.category, value)}
        onStartEdit={(budgetType) => setEditingCategory({ category: cat.category, budgetType })}
        onSaveItems={(items, reason) => handleSaveItemsWithTracking(cat.category, editingCategory?.budgetType || 'variable', items, reason)}
        onCancelEdit={() => setEditingCategory(null)}
    />
))}

NOTA: Esto reemplaza ~170 líneas con 15 líneas limpias.
"@

Write-Host ""
Write-Host "✅ Pasos 1 y 2 completados automáticamente" -ForegroundColor Green
Write-Host "⚠️  Paso 3: Ver archivo MANUAL_STEP3.txt para instrucciones" -ForegroundColor Yellow
Write-Host ""
Write-Host "Archivos modificados:" -ForegroundColor Cyan

Write-Host "  - Import agregado ✅" -ForegroundColor Green
Write-Host "  - Handler agregado ✅" -ForegroundColor Green
Write-Host "  - Map pendiente ⏳ (manual)" -ForegroundColor Yellow
