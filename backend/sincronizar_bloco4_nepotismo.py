import asyncio
from sqlalchemy import func
import database
import models
import heuristicas
from integracoes import nepotismo_cruzado


async def main():
    models.Base.metadata.create_all(bind=database.engine)
    db = database.SessionLocal()
    try:
        deps_com_assessores = (
            db.query(models.Deputado)
            .join(models.AssessorGabinete, models.AssessorGabinete.deputado_id == models.Deputado.id)
            .group_by(models.Deputado.id)
            .having(func.count(models.AssessorGabinete.id) > 0)
            .all()
        )
        print(f"=== Sincronizando Bloco 4 (Nepotismo Cruzado, Clas e TSE) para {len(deps_com_assessores)} deputados ===")
        total_vinculos = 0
        for dep in deps_com_assessores:
            qtd = await nepotismo_cruzado.sincronizar_nepotismo_cruzado_deputado(db, dep.id)
            total_vinculos += qtd
            heuristicas.rodar_motor_heuristicas_por_deputado(db, dep.id)
            print(f"  [Bloco 4] Deputado {dep.nome} ({dep.id} - {dep.partido}/{dep.uf}): {qtd} vinculos familiares/politicos detectados.")
        print(f"=== Concluido! Total de vinculos de nepotismo/TSE/QSA detectados: {total_vinculos} ===")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
