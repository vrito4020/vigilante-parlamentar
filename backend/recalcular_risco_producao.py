import database
import models
import heuristicas


def main():
    db = database.SessionLocal()
    try:
        # Limpeza do Radar Judiciário: Remove sanções de favorecidos de emendas
        # contratados por órgãos locais (Princípio da Imputação Direta)
        del_count = db.query(models.ProcessoJudicialRadar).filter(
            models.ProcessoJudicialRadar.polo_alvo.like('Favorecido Emenda:%')
        ).delete(synchronize_session=False)
        db.commit()
        if del_count > 0:
            print(f"Limpeza forense: {del_count} processos de favorecidos de emendas removidos do Radar Judiciário.")

        deputados = db.query(models.Deputado).all()
        print(f"Recalculando risco acumulado (Princípio da Imputação Direta) para {len(deputados)} deputados...")
        for dep in deputados:
            heuristicas.rodar_motor_heuristicas_por_deputado(db, dep.id)
        print("Recálculo concluído com sucesso!")
    finally:
        db.close()


if __name__ == "__main__":
    main()
