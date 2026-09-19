declare module 'mammoth' {
  export type ExtractResult = {
    value: string
  }

  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<ExtractResult>
}
