export interface IOptions {
    '--': any
    'host': string
    'port': number
    'open': boolean
}

export interface IConfig {
    host: string
    port: number
    open: boolean
    cwd: string
    home: string
    openCodePath: string | null
    codexPath: string
}
