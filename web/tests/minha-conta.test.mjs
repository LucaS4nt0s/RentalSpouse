import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');

test('AppHeader unifica navegação por perfil, menu mobile responsivo e rota /minha-conta (#94)', () => {
  const headerPath = path.join(webRoot, 'components', 'layout', 'AppHeader.tsx');
  assert.ok(fs.existsSync(headerPath), 'AppHeader.tsx deve existir');
  const source = fs.readFileSync(headerPath, 'utf-8');

  // Links por perfil
  assert.match(source, /\/minha-conta/, 'AppHeader deve apontar Minha Conta para /minha-conta');
  assert.match(source, /\/cliente\/orcamentos/, 'AppHeader deve conter link de orçamentos do cliente');
  assert.match(source, /\/cliente\/agendamentos/, 'AppHeader deve conter link de agendamentos do cliente');
  assert.match(source, /\/profissional\/orcamentos/, 'AppHeader deve conter link de orçamentos do profissional');
  assert.match(source, /\/profissional\/documentos/, 'AppHeader deve conter link de documentos do profissional');
  assert.match(source, /\/admin\/moderacao/, 'AppHeader deve conter link de moderação do admin');
  assert.match(source, /Menu de navegação móvel/, 'AppHeader deve possuir drawer responsivo para mobile');
  assert.match(source, /Confirmar saída/, 'AppHeader deve proteger botão Sair contra clique acidental');
});

test('Home (page.tsx) e páginas principais usam AppHeader e apontam Minha Conta para /minha-conta (#94)', () => {
  const homeSource = fs.readFileSync(path.join(webRoot, 'app', 'page.tsx'), 'utf-8');
  assert.match(homeSource, /<AppHeader\s*\/>/, 'Home deve utilizar o componente unificado AppHeader');
  assert.match(homeSource, /href="\/minha-conta"/, 'CTA Minha Conta na Home deve apontar para /minha-conta');
  assert.doesNotMatch(
    homeSource,
    /href="\/entrar"[\s\S]{0,120}Minha Conta/,
    'Nenhum link de Minha Conta na Home pode redirecionar para /entrar'
  );
});

test('Página /minha-conta renderiza abas de edição de dados, preferências de tema e troca de senha (#94)', () => {
  const minhaContaPath = path.join(webRoot, 'app', 'minha-conta', 'page.tsx');
  assert.ok(fs.existsSync(minhaContaPath), 'web/app/minha-conta/page.tsx deve existir');
  const source = fs.readFileSync(minhaContaPath, 'utf-8');

  assert.match(source, /<AppHeader\s*\/>/, 'Página Minha Conta deve renderizar AppHeader');
  assert.match(source, /\/api\/auth\/me/, 'Página Minha Conta deve consumir e atualizar /api/auth/me');
  assert.match(source, /method:\s*'PATCH'/, 'Página Minha Conta deve enviar PATCH para atualizar dados');
  assert.match(source, /updateUser\(/, 'Página Minha Conta deve sincronizar AuthContext imediatamente');
  assert.match(source, /Preferências & Segurança/, 'Página Minha Conta deve exibir aba de Preferências e Segurança');
  assert.match(source, /Alterar Senha de Acesso/, 'Página Minha Conta deve permitir alteração de senha');
});

test('Página /minha-conta integra useAddressLookup e substitui endereço antigo ao trocar CEP', () => {
  const minhaContaSource = fs.readFileSync(
    path.join(webRoot, 'app', 'minha-conta', 'page.tsx'),
    'utf-8'
  );
  const hookSource = fs.readFileSync(
    path.join(webRoot, 'hooks', 'useAddressLookup.ts'),
    'utf-8'
  );
  const addressSectionSource = fs.readFileSync(
    path.join(webRoot, 'components', 'sections', 'AddressSection.tsx'),
    'utf-8'
  );

  assert.match(minhaContaSource, /useAddressLookup\(/, 'Minha Conta deve usar useAddressLookup para buscar ViaCEP');
  assert.match(minhaContaSource, /syncCep\(/, 'Minha Conta deve sincronizar CEP carregado via syncCep sem busca duplicada');
  assert.match(minhaContaSource, /setLogradouro\(result\.logradouro\)/, 'Deve substituir logradouro ao buscar novo CEP');
  assert.match(minhaContaSource, /setBairro\(result\.bairro\)/, 'Deve substituir bairro ao buscar novo CEP');
  assert.match(minhaContaSource, /setCidade\(result\.cidade\)/, 'Deve substituir cidade do cliente ao buscar novo CEP');
  assert.match(minhaContaSource, /setEstado\(result\.estado_uf\)/, 'Deve substituir UF do cliente ao buscar novo CEP');
  assert.match(minhaContaSource, /setCity\(result\.cidade\)/, 'Deve substituir city do profissional ao buscar novo CEP');
  assert.match(minhaContaSource, /setStateUf\(result\.estado_uf\)/, 'Deve substituir stateUf do profissional ao buscar novo CEP');
  assert.match(hookSource, /setLastSearchedCep\(''\)/, 'useAddressLookup deve limpar último CEP consultado ao editar dígitos');
  assert.match(hookSource, /syncCep/, 'useAddressLookup deve expor syncCep');
  assert.doesNotMatch(addressSectionSource, /if\s*\(result\.logradouro\)/, 'AddressSection deve sobrescrever logradouro antigo mesmo se vazio no novo CEP');
});
