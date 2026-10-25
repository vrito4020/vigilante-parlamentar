import asyncio
from sqlalchemy import func
import database
import models
import heuristicas
from integracoes import pncp


async def main():
    models.Base.metadata.create_all(bind=database.engine)
    db = database.SessionLocal()
    try:
        deps_com_despesa = (
            db.query(models.Deputado)
            .join(models.DespesaCEAP, models.DespesaCEAP.deputado_id == models.Deputado.id)
            .group_by(models.Deputado.id)
            .having(func.count(models.DespesaCEAP.id) > 0)
            .all()
        )
        print(f"=== Sincronizando Bloco 2 (PNCP) para {len(deps_com_despesa)} deputados auditados ===")
        total_contratos = 0
        for dep in deps_com_despesa:
            qtd = await pncp.sincronizar_contratos_pncp_deputado(db, dep.id, max_fornecedores=18)
            total_contratos += qtd
            heuristicas.rodar_motor_heuristicas_por_deputado(db, dep.id)
        print(f"=== Concluído! Total de contratos PNCP vinculados: {total_contratos} ===")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
