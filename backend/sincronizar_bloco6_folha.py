import asyncio
import database
import models
import heuristicas
from integracoes import auditoria_folha


async def main():
    models.Base.metadata.create_all(bind=database.engine)
    db = database.SessionLocal()
    try:
        ids_auditados = [d[0] for d in db.query(models.DespesaCEAP.deputado_id).distinct().all()]
        ids_extras = [62881, 66385, 66828, 69871, 72442, 73433, 73441, 73604, 73701, 73768, 73808, 74161, 74858, 204374, 204534, 204535, 204536, 209787]
        todos_ids = sorted(set(ids_auditados + ids_extras))
        deps_auditados = db.query(models.Deputado).filter(models.Deputado.id.in_(todos_ids)).all()

        print(f"=== Sincronizando Bloco 6 (Auditoria de Folha, DOU/CEAF, Dupla Lotacao e CNEs) para {len(deps_auditados)} deputados ===")
        total_servidores = 0
        total_anomalias = 0
        for dep in deps_auditados:
            qtd = await auditoria_folha.sincronizar_auditoria_folha_deputado(db, dep.id)
            total_servidores += qtd
            anoms = (
                db.query(models.AuditoriaFolhaGabinete)
                .filter(
                    models.AuditoriaFolhaGabinete.deputado_id == dep.id,
                    models.AuditoriaFolhaGabinete.indicio_fantasma_ou_acumulo == True,
                )
                .count()
            )
            total_anomalias += anoms
            heuristicas.rodar_motor_heuristicas_por_deputado(db, dep.id)
            print(f"  [Bloco 6] Deputado {dep.nome} ({dep.id} - {dep.partido}/{dep.uf}): {qtd} servidores auditados ({anoms} anomalias funcionais/DOU/QSA).")
        print(f"=== Concluido! Total de servidores auditados: {total_servidores} | Anomalias detectadas: {total_anomalias} ===")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
