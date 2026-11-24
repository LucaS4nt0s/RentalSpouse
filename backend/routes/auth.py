from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
import models
from schemas import (
    ContaUpdateRequest,
    LoginRequest,
    TokenResponse,
    UserRead,
    mascarar_cpf_leitura,
)
from security import (
    create_access_token,
    get_current_user,
    hash_senha,
    verificar_senha,
)

router = APIRouter(prefix="/api/auth", tags=["Autenticação"])
conta_router = APIRouter(prefix="/api/conta", tags=["Minha Conta"])


# Hash fictício pré-calculado com PBKDF2 (600.000 iterações) para atenuar timing attacks
_DUMMY_HASH = (
    "00000000000000000000000000000000$"
    "0000000000000000000000000000000000000000000000000000000000000000"
)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login de usuário",
    description="Autentica um usuário via e-mail e senha, retornando um token de acesso JWT.",
)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """
    Realiza a autenticação de usuários, administradores, clientes e profissionais.

    Nota de Segurança (Trade-off de Enumeração):
    A validação da senha SEMPRE precede a verificação de flags adicionais (ex.: email_verificado).
    Se o e-mail existir mas a senha estiver incorreta, o endpoint responde estritamente com
    HTTP 401 Unauthorized, impedindo que invasores descubram se um e-mail possui pendência
    de confirmação sem conhecer as credenciais válidas da conta.
    """
    email = payload.email  # Já normalizado pelo validator do LoginRequest
    user = db.query(models.User).filter(models.User.email == email).first()
    senha_valida = False

    # Se não encontrado na tabela de users, verifica na tabela de clientes ou profissionais
    if user is None:
        cliente = db.query(models.Cliente).filter(models.Cliente.email == email).first()
        if cliente is not None:
            # 1. Valida a senha contra o hash do cliente
            if not verificar_senha(payload.password, cliente.senha_hash):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Credenciais inválidas: e-mail ou senha incorretos",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # 2. Bloqueia o login caso o e-mail não tenha sido confirmado via link
            if not cliente.email_verificado:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="E-mail pendente de confirmação. Por favor, verifique sua caixa de entrada.",
                )

            # 3. Sincroniza com a tabela de usuários para unificar autenticação (sem jamais alterar role existente)
            user = models.User(
                name=cliente.nome,
                email=cliente.email,
                hashed_password=cliente.senha_hash,
                role=models.UserRole.CLIENT.value,
                is_active=True,
                email_verificado=cliente.email_verificado,
                created_at=cliente.criado_em,
            )
            try:
                db.add(user)
                db.commit()
                db.refresh(user)
            except IntegrityError:
                db.rollback()
                user = db.query(models.User).filter(models.User.email == email).first()
                if user is not None and user.role != models.UserRole.CLIENT.value:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Conflito de identidade detectado para este e-mail.",
                    )

            # Evita custo duplo de PBKDF2 (600.000 iterações já executadas na validação acima)
            senha_valida = True
        else:
            # Verifica se é um profissional cadastrado
            profissional = (
                db.query(models.Professional)
                .filter(models.Professional.email == email)
                .first()
            )
            if profissional is not None and profissional.senha_hash:
                if not verificar_senha(payload.password, profissional.senha_hash):
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Credenciais inválidas: e-mail ou senha incorretos",
                        headers={"WWW-Authenticate": "Bearer"},
                    )

                if not profissional.is_active:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Conta desativada",
                        headers={"WWW-Authenticate": "Bearer"},
                    )

                # Sincroniza profissional com a tabela users (sem jamais sobrescrever role existente)
                user = models.User(
                    name=profissional.name,
                    email=profissional.email,
                    hashed_password=profissional.senha_hash,
                    role=models.UserRole.PROFESSIONAL.value,
                    is_active=profissional.is_active,
                    email_verificado=bool(getattr(profissional, "email_verificado", False)),
                    created_at=profissional.created_at,
                )
                try:
                    db.add(user)
                    db.commit()
                    db.refresh(user)
                except IntegrityError:
                    db.rollback()
                    user = db.query(models.User).filter(models.User.email == email).first()
                    if user is not None and user.role != models.UserRole.PROFESSIONAL.value:
                        raise HTTPException(
                            status_code=status.HTTP_409_CONFLICT,
                            detail="Conflito de identidade detectado para este e-mail.",
                        )

                senha_valida = True
            else:
                verificar_senha(payload.password, _DUMMY_HASH)
                senha_valida = False
    else:
        # Usuário já existe na tabela users: valida credenciais
        if not verificar_senha(payload.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Credenciais inválidas: e-mail ou senha incorretos",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Se for cliente, bloqueia caso o e-mail não tenha sido confirmado
        if user.role == models.UserRole.CLIENT.value:
            cliente = db.query(models.Cliente).filter(models.Cliente.email == email).first()
            if cliente is not None and not cliente.email_verificado:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="E-mail pendente de confirmação. Por favor, verifique sua caixa de entrada.",
                )

        # Se for profissional, valida status na tabela de profissionais
        if user.role == models.UserRole.PROFESSIONAL.value:
            profissional = (
                db.query(models.Professional)
                .filter(models.Professional.email == email)
                .first()
            )
            if profissional is not None and not profissional.is_active:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Conta desativada",
                    headers={"WWW-Authenticate": "Bearer"},
                )

        senha_valida = True

    if user is None or not senha_valida:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas: e-mail ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Conta desativada",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(data={"sub": user.email, "role": user.role})
    return TokenResponse(access_token=token, token_type="bearer", user=user)


def _montar_perfil_usuario(current_user: models.User, db: Session) -> UserRead:
    """Monta a resposta consolidada do perfil autenticado conforme o papel (client, professional ou admin)."""
    base_data = {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "is_active": current_user.is_active,
        "email_verificado": bool(getattr(current_user, "email_verificado", True)),
        "created_at": current_user.created_at,
    }

    if current_user.role == models.UserRole.CLIENT.value:
        cliente = (
            db.query(models.Cliente)
            .filter(models.Cliente.email == current_user.email)
            .first()
        )
        if cliente is not None:
            base_data.update(
                {
                    "name": cliente.nome,
                    "email_verificado": cliente.email_verificado,
                    "cpf": mascarar_cpf_leitura(cliente.cpf),
                    "data_nascimento": cliente.data_nascimento,
                    "cep": cliente.cep,
                    "logradouro": cliente.logradouro,
                    "numero": cliente.numero,
                    "complemento": cliente.complemento,
                    "bairro": cliente.bairro,
                    "cidade": cliente.cidade,
                    "estado": cliente.estado,
                    "endereco": cliente.endereco,
                }
            )
    elif current_user.role == models.UserRole.PROFESSIONAL.value:
        prof = (
            db.query(models.Professional)
            .filter(models.Professional.email == current_user.email)
            .first()
        )
        if prof is not None:
            base_data.update(
                {
                    "name": prof.name,
                    "is_active": prof.is_active,
                    "email_verificado": bool(getattr(prof, "email_verificado", True)),
                    "phone": prof.phone,
                    "bio": prof.bio,
                    "service_radius_km": prof.service_radius_km,
                    "specialties": list(prof.specialties or []),
                    "cep": prof.cep,
                    "logradouro": prof.logradouro,
                    "numero": prof.numero,
                    "complemento": prof.complemento,
                    "bairro": prof.bairro,
                    "city": prof.city,
                    "state": prof.state,
                    "approval_status": prof.approval_status,
                }
            )

    return UserRead(**base_data)


@router.get(
    "/me",
    response_model=UserRead,
    summary="Obter perfil autenticado",
    description="Retorna os dados completos do perfil do usuário atualmente autenticado conforme seu papel.",
)
@conta_router.get(
    "/me",
    response_model=UserRead,
    summary="Obter perfil autenticado (Minha Conta)",
)
def get_me(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retorna os dados cadastrais completos do usuário autenticado atual."""
    return _montar_perfil_usuario(current_user, db)

@router.patch(
    "/me",
    response_model=UserRead,
    summary="Atualizar dados da conta autenticada",
    description="Atualiza dados cadastrais, endereço, perfil profissional e/ou senha do usuário autenticado.",
)
@conta_router.patch(
    "/me",
    response_model=UserRead,
    summary="Atualizar dados da conta autenticada (Minha Conta)",
)
def update_me(
    payload: ContaUpdateRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Atualiza de forma segura os dados cadastrais e/ou a senha do usuário autenticado,
    mantendo sincronia entre `models.User` e a tabela de origem (`models.Cliente` ou `models.Professional`).
    """
    db_user = (
        db.query(models.User)
        .filter(models.User.email == current_user.email)
        .first()
    )
    cliente = (
        db.query(models.Cliente)
        .filter(models.Cliente.email == current_user.email)
        .first()
        if current_user.role == models.UserRole.CLIENT.value
        else None
    )
    prof = (
        db.query(models.Professional)
        .filter(models.Professional.email == current_user.email)
        .first()
        if current_user.role == models.UserRole.PROFESSIONAL.value
        else None
    )

    # 1. Alteração opcional de senha (exige validação da senha atual)
    if payload.nova_senha:
        if not payload.senha_atual or not payload.senha_atual.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Informe sua senha atual para definir uma nova senha.",
            )

        hash_atual = (
            (cliente.senha_hash if cliente and cliente.senha_hash else None)
            or (prof.senha_hash if prof and prof.senha_hash else None)
            or (db_user.hashed_password if db_user else current_user.hashed_password)
        )
        if not hash_atual or not verificar_senha(payload.senha_atual, hash_atual):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A senha atual informada está incorreta.",
            )

        novo_hash = hash_senha(payload.nova_senha)
        if db_user is not None:
            db_user.hashed_password = novo_hash
        if cliente is not None:
            cliente.senha_hash = novo_hash
        if prof is not None:
            prof.senha_hash = novo_hash
        current_user.hashed_password = novo_hash

    # 2. Atualização de dados cadastrais conforme o papel (role)
    if current_user.role == models.UserRole.CLIENT.value:
        if cliente is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perfil de cliente não encontrado.",
            )
        if payload.name is not None:
            if len(payload.name) < 3:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="O nome deve ter no mínimo 3 caracteres.",
                )
            cliente.nome = payload.name
            current_user.name = payload.name
            if db_user is not None:
                db_user.name = payload.name
        if payload.data_nascimento is not None:
            cliente.data_nascimento = payload.data_nascimento
        if payload.cep is not None:
            cliente.cep = payload.cep
        if payload.logradouro is not None:
            cliente.logradouro = payload.logradouro
        if payload.numero is not None:
            cliente.numero = payload.numero
        if "complemento" in payload.model_fields_set:
            cliente.complemento = payload.complemento
        if payload.bairro is not None:
            cliente.bairro = payload.bairro
        if payload.cidade is not None:
            cliente.cidade = payload.cidade
        elif payload.city is not None:
            cliente.cidade = payload.city
        if payload.estado is not None:
            cliente.estado = payload.estado
        elif payload.state is not None:
            cliente.estado = payload.state
        if payload.latitude is not None or payload.longitude is not None:
            if payload.latitude is not None:
                cliente.latitude = payload.latitude
            if payload.longitude is not None:
                cliente.longitude = payload.longitude
        elif payload.model_fields_set & {
            "cep", "logradouro", "numero", "bairro", "cidade", "city", "estado", "state"
        }:
            cliente.latitude = None
            cliente.longitude = None

    elif current_user.role == models.UserRole.PROFESSIONAL.value:
        if prof is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perfil de profissional não encontrado.",
            )
        if payload.name is not None:
            prof.name = payload.name
            current_user.name = payload.name
            if db_user is not None:
                db_user.name = payload.name
        if "phone" in payload.model_fields_set:
            prof.phone = (payload.phone or "").strip() or None
        if payload.bio is not None:
            prof.bio = payload.bio
        if payload.service_radius_km is not None:
            prof.service_radius_km = payload.service_radius_km
        if payload.specialties is not None:
            prof.specialties = payload.specialties
        if payload.cep is not None:
            prof.cep = payload.cep
        if payload.logradouro is not None:
            prof.logradouro = payload.logradouro
        if payload.numero is not None:
            prof.numero = payload.numero
        if "complemento" in payload.model_fields_set:
            prof.complemento = payload.complemento
        if payload.bairro is not None:
            prof.bairro = payload.bairro
        if payload.city is not None:
            prof.city = payload.city
        elif payload.cidade is not None:
            prof.city = payload.cidade
        if payload.state is not None:
            prof.state = payload.state
        elif payload.estado is not None:
            prof.state = payload.estado
        if payload.latitude is not None or payload.longitude is not None:
            if payload.latitude is not None:
                prof.latitude = payload.latitude
            if payload.longitude is not None:
                prof.longitude = payload.longitude
        elif payload.model_fields_set & {
            "cep", "logradouro", "numero", "bairro", "cidade", "city", "estado", "state"
        }:
            prof.latitude = None
            prof.longitude = None
        prof.update_normalized_fields()

    else:
        # Administrador (models.User)
        if payload.name is not None:
            current_user.name = payload.name
            if db_user is not None:
                db_user.name = payload.name

    db.commit()
    if db_user is not None:
        db.refresh(db_user)
    if cliente is not None:
        db.refresh(cliente)
    if prof is not None:
        db.refresh(prof)

    return _montar_perfil_usuario(current_user, db)
