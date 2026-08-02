# CEO panel — cómo hacer seguimiento sin tocar código

## Tus 5 números (Langfuse dashboard, ~2 min)
1. 💰 Costo vs presupuesto (alerta Slack al 80%)
2. ⚡ Latencia p95
3. ✓ Calidad (score de evals por versión)
4. 📈 Uso (requests / usuarios activos)
5. ↺ Automatización (% de trabajo terminado por loops sin tocar a nadie)

## Tus 3 controles
1. **Apruebas el "qué"**: GitHub Projects → columna "CEO approval". Un spec sin tu check no se construye.
2. **Reporte semanal automático**: llega solo cada lunes 8am (loop `weekly-ceo-report`). Si no llega, eso ya es una señal.
3. **Checkpoints**: cuando un loop quiere gastar dinero, enviar mensajes externos o borrar datos, te llega una aprobación a Slack. Tu "sí/no" es el freno.

## Qué mirar en la reunión semanal (si la hay)
- Specs esperando aprobación (¿estás siendo tú el cuello de botella?)
- Loops supervisados listos para graduarse a autónomos (¿corridas limpias suficientes?)
- Evals: tendencia, no el número absoluto.
