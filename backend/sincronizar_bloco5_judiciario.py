import asyncio
from sqlalchemy import func
import database
import models
import heuristicas
from integracoes import radar_judiciario


async def main():
    models.Base.metadata.create_all(bind=database.engine)
    db = database.SessionLocal()
    try:
        ids_Auditados = [d[0] for d in db.query(models.DespesaCEAP.deputado_id).distinct().all()]
        ids_extras = [62881, 66385, 66828, 69871, 72442, 73433, 73441, 73604, 73701, 73768, 73808, 74161, 74858, 204374, 204534, 204535, 204536, 209787]
        todos_ids = sorted(set(ids_Auditados + ids_extras))
        deps_auditados = db.query(models.Deputado).filter(models.Deputado.id.in_(todos_ids)).all()
        print(f"=== Sincronizando Bloco 5 (Radar Judiciario - CNJ DataJud / TSE / CGU) para {len(deps_auditados)} deputados ===")
        total_procs = 0
        for dep in deps_auditados:
            qtd = await radar_judiciario.sincronizar_radar_judiciario_deputado(db, dep.id)
            total_procs += qtd
            heuristicas.rodar_motor_heuristicas_por_deputado(db, dep.id)
            print(f"  [Bloco 5] Deputado {dep.nome} ({dep.id} - {dep.partido}/{dep.uf}): {qtd} processos/certidoes no Radar Judiciario.")
        print(f"=== Concluido! Total de processos/certidoes no Radar Judiciario: {total_procs} ===")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
