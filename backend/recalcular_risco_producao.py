import database
import models
import heuristicas


def main():
    db = database.SessionLocal()
    try:
        deputados = db.query(models.Deputado).all()
        print(f"Recalculando risco acumulado (sem limite de 100) para {len(deputados)} deputados...")
        for dep in deputados:
            heuristicas.rodar_motor_heuristicas_por_deputado(db, dep.id)
        print("Recálculo concluído com sucesso!")
    finally:
        db.close()


if __name__ == "__main__":
    main()
