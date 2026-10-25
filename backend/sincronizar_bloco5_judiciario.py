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
        deps_auditados = (
            db.query(models.Deputado)
            .join(models.DespesaCEAP, models.DespesaCEAP.deputado_id == models.Deputado.id)
            .group_by(models.Deputado.id)
            .having(func.count(models.DespesaCEAP.id) > 0)
            .all()
        )
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
