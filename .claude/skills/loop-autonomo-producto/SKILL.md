---
name: loop-autonomo-producto
description: Loop autónomo build-test-fix que toma una spec aprobada y itera sin intervención humana hasta que el producto está funcional, desplegado y corriendo. Usar cuando una spec en GitHub Projects pasa a estado "Aprobada" y se pide construir el producto de punta a punta (Camino Dorado pasos 3-5).
---

# Loop Autónomo de Producto (v1.0)

## Objetivo

Después de que el CEO aprueba la spec (Camino Dorado paso 2), este loop construye, prueba, corrige y despliega el producto **sin intervención humana**, hasta que pasa el **Gate de Aceptación Funcional**. El resultado final es un producto corriendo en Vercel con el Plano de Control (C) monitoreando.

**Regla de oro:** "funcional" no lo decide una opinión — lo decide evidencia de ejecución real contra la rúbrica de abajo. El juez nunca aprueba leyendo código; aprueba usando el producto.

## Cuándo se activa

- Spec aprobada en GitHub Projects (nada se construye sin spec — regla del framework).
- Template estándar clonado (A, B, C, D pre-cableados).

## Arquitectura del loop

Dos agentes con contextos SEPARADOS (nunca el mismo contexto para construir y juzgar):

```
SPEC aprobada
   │
   ▼
┌─────────────────┐
│ BUILDER agent    │  Construye/corrige con Agent SDK + Claude Code.
│ (constructor)    │  Next.js + Supabase. Commit por iteración.
└────────┬────────┘
         ▼
   Deploy a Vercel PREVIEW (+ Supabase branch para datos)
         │
         ▼
┌─────────────────┐
│ TESTER agent     │  Usa el producto como usuario real vía browser
│ (juez)           │  automation (Playwright/Claude in Chrome):
│                  │  navega, hace click, llena forms, rompe cosas.
│                  │  Captura screenshots + logs + network errors.
└────────┬────────┘
         ▼
   Score contra RÚBRICA (0-100)
         │
   ├── score ≥ 90 y cero bloqueantes → GATE PASA → merge → deploy prod
   └── score < 90 → reporte de fallos concreto → vuelve al BUILDER
```

## Gate de Aceptación Funcional ("test del humano")

El criterio "cualquier humano lo aceptaría" se operacionaliza en checks verificables. Todos son PASA/FALLA con evidencia (screenshot, log o video):

| # | Check | Bloqueante |
|---|-------|-----------|
| 1 | La app carga en < 3s sin errores en consola | Sí |
| 2 | El flujo principal de la spec se completa de punta a punta sin ayuda | Sí |
| 3 | Cero pantallas muertas, 404 internos o botones sin acción | Sí |
| 4 | Todo error de usuario muestra mensaje claro (nunca stack trace ni pantalla blanca) | Sí |
| 5 | Auth funciona: signup, login, logout, sesión persiste | Sí |
| 6 | Datos persisten: crear → recargar → sigue ahí (Supabase) | Sí |
| 7 | Responsive: usable en móvil (viewport 390px) y desktop | No |
| 8 | Evals de calidad IA pasan umbral (RAGAS/Promptfoo, si aplica RAG/agente) | Sí |
| 9 | Inputs maliciosos básicos no rompen la app (XSS simple, campos vacíos, textos de 10k chars) | Sí |
| 10 | Un tester agent SIN acceso a la spec puede deducir qué hace el producto y usarlo | No |

**Umbral:** score ≥ 90/100 y todos los bloqueantes en PASA.

## Reglas anti-fracaso (obligatorias)

1. **Juez ≠ constructor.** El tester corre en proceso/contexto propio, con prompt adversarial: "tu trabajo es encontrar por qué esto NO está listo".
2. **Evidencia, no opinión.** Cada check falla o pasa con screenshot/log adjunto. Prohibido aprobar por inspección de código.
3. **Anti reward-hacking.** El builder nunca ve la rúbrica completa, solo el reporte de fallos de cada iteración. La rúbrica vive en el repo del tester.
4. **Kill-switch por presupuesto:** máximo 15 iteraciones O $X en tokens (definir en `config.yaml`, enforcement vía Langfuse). Al agotarse: escalar a humano con reporte del estado, NUNCA declarar victoria.
5. **Anti-oscilación:** si el mismo check falla 3 iteraciones seguidas, el builder debe cambiar de estrategia (documentar el enfoque anterior como fallido) o escalar.
6. **Commit por iteración** con mensaje `loop-iter-N: <fallos corregidos>`. Si no está en GitHub, no existe.

## Integración con el stack AI Labs

- **Deploy de prueba:** Vercel preview deployments por iteración; Supabase branch para la DB (no tocar prod).
- **CI (Agente D):** el gate del loop corre como job adicional en GitHub Actions; el merge a main requiere gate verde + code review del Agente D.
- **Observabilidad:** cada iteración tracea a Langfuse (costo, latencia, score). El dashboard del CEO muestra: iteración actual, score, costo acumulado vs budget.
- **Evals:** Promptfoo/RAGAS como parte del check #8 cuando el producto incluye componente IA.

## Pseudocódigo de referencia (Agent SDK)

```python
spec = load_approved_spec(github_project_id)
rubric = load_rubric()          # solo visible para el tester
budget = Budget(max_iters=15, max_usd=config.loop_budget)

report = None
while budget.ok():
    builder = Agent(role="builder", context=fresh())
    builder.run(spec=spec, failures=report)          # construye o corrige
    url = deploy_vercel_preview() ; db = supabase_branch()

    tester = Agent(role="tester", context=fresh(), tools=[browser])
    report = tester.evaluate(url, rubric)             # usa el producto, no lee código
    log_langfuse(iter=budget.iter, score=report.score, cost=budget.spent)

    if report.score >= 90 and report.blockers == 0:
        merge_and_deploy_prod()
        notify_slack("✅ Producto funcional y en producción", report)
        return
    if report.repeated_failure(n=3):
        builder.force_strategy_change(report)

escalate_to_human(report)  # presupuesto agotado: reporte honesto, sin victoria falsa
```

## Definition of Done

El loop termina exitosamente solo cuando: (1) gate ≥ 90 con cero bloqueantes y evidencia adjunta, (2) merge a main con CI verde del Agente D, (3) desplegado en Vercel producción y respondiendo, (4) Plano de Control monitoreando con dashboard activo, (5) reporte final en Slack con score, iteraciones y costo total.

**Para el ingeniero:** la spec entra por vibe coding; todo lo demás — construir, probar, corregir, desplegar — lo hace el loop. Tu trabajo es configurar `config.yaml` (budget, umbral, canal Slack) y atender solo las escalaciones.

---

## Addendum v1.1 — endurecimiento basado en evidencia (jul 2026)

Ajustes derivados de la validación contra mejores prácticas del mercado. No cambian la
arquitectura; cierran huecos conocidos de este tipo de loops:

1. **Checks reservados (holdout).** Cada corrida, el tester rota 3 checks que no formaban
   parte del reporte anterior. Evita que el builder se sobreajuste al gate incluso sin ver
   la rúbrica (el reward hacking persiste aunque la rúbrica esté oculta).
2. **Bloqueantes ampliados.** El gate no es solo funcional: `security` (secret scan, deps,
   linter de operaciones destructivas) y `cost` (dentro de `budget_usd`) son bloqueantes.
   Un producto que funciona pero filtra una llave NO pasa.
3. **Escalar por estancamiento, no solo por límite.** Si 3 iteraciones quedan a ≤5 puntos
   del umbral, escalar de inmediato: estar cerca sin cerrar suele indicar spec ambigua,
   no falta de intentos.
4. **Deriva del juez.** Registrar todos los scores en Langfuse y comparar contra el
   veredicto humano en el piloto. Si la concordancia baja de ~90%, pausar merges autónomos
   y recalibrar la rúbrica.
5. **Producción con compuerta.** El loop despliega y valida en **preview**; el paso a
   producción exige CI verde (incluido el gate de seguridad) más promoción humana.
6. **Acciones irreversibles siempre humanas**, en cualquier nivel de autonomía y también
   dentro del loop: borrar datos, gastar dinero, enviar mensajes al exterior.
7. **La spec manda.** El loop construye exactamente lo especificado: las criterios numerados
   (`THE SYSTEM SHALL`) y los invariantes (`SHALL NEVER`) del template de spec son la entrada
   real del builder y la base de la rúbrica del juez.

8. **Enrutamiento de modelos (costo optimizado).** El loop nunca fija un modelo: pide
   `runTask(clase)` y el router elige el escalón más barato capaz (`config.yaml → models`).
   Builder = clase `code`; si el mismo check falla 2 veces puede subir a `architect` por
   una ronda y luego baja. Juez = clase `judge` y **debe ser de una familia distinta a la
   del builder** (un modelo que califica salidas de su propia familia tiene sesgo
   documentado). Los checks rutinarios del gate corren en el escalón más barato.
   El dashboard muestra costo por clase y tasa de escalada: si una clase escala mucho, el
   problema es la spec o el prompt, no el presupuesto.
