// Imagens importadas como módulo (Metro devolve o id do asset).
declare module '*.png' {
  const id: number;
  export default id;
}
