// O runtime do Mermaid é um asset .html embutido no canvas (ESPECIFICACAO-APP-RN-EXPO.md §3, §8.1).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('html');

// Monorepo com npm workspaces: `react`/`react-dom`/`scheduler` acabam instalados em DOIS
// lugares (raiz do monorepo, versão mais nova puxada por alguma outra ferramenta do repo que
// não é o editor; e aqui em editor/node_modules, versão que o React Native realmente espera —
// confirmado certa via `npx expo install --check`, "Dependencies are up to date"). Sem isso, o
// Metro empacota as DUAS cópias fisicamente distintas no mesmo bundle — cada uma vira um módulo
// separado, quebrando o dispatcher singleton do React ("Invalid hook call... more than one copy
// of React", bug real visto rodando o app de verdade). `resolver.extraNodeModules` sozinho não
// bastou (o resolvedor de "package exports" do Metro, que o React 19 aciona por ter esse campo
// no package.json, ignora `extraNodeModules`) — `resolveRequest` intercepta TODA resolução
// dessas libs incondicionalmente, sempre resolvendo pro arquivo físico dentro deste workspace,
// não importa de qual `node_modules` a requisição começou.
const REACT_SINGLETON_PACKAGES = new Set(['react', 'react-dom', 'scheduler']);
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (REACT_SINGLETON_PACKAGES.has(moduleName)) {
    return { type: 'sourceFile', filePath: require.resolve(moduleName, { paths: [__dirname] }) };
  }
  if (defaultResolveRequest) return defaultResolveRequest(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
