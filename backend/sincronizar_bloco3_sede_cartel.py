import asyncio
from sqlalchemy import func
import database
import models
import heuristicas
from integracoes import sede_cartel


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
        print(f"=== Sincronizando Bloco 3 (Sede Fisica, QSA e Carteis) para {len(deps_com_despesa)} deputados ===")
        total_dossies = 0
        for dep in deps_com_despesa:
            qtd = await sede_cartel.sincronizar_dossie_fornecedores_deputado(db, dep.id, max_fornecedores=14)
            total_dossies += qtd
            print(f"  [Bloco 3] Deputado {dep.nome} ({dep.id}): {qtd} fornecedores auditados fisicamente.")

        print("=== Executando Cruzamento Global de Enderecos, Telefones e QSA entre Gabinetes ===")
        for dep in deps_com_despesa:
            sede_cartel.avaliar_indicios_cartel_e_sede_fantasma(db, dep.id)
            heuristicas.rodar_motor_heuristicas_por_deputado(db, dep.id)

        suspeitos = db.query(models.DossieFornecedorGabinete).filter_by(indicio_cartel_ou_fantasma=True).count()
        print(f"=== Concluido! Total de dossies fisicos: {total_dossies} | Com indicios de cartel/sede suspeita: {suspeitos} ===")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
