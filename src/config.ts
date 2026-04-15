import process from 'node:process'

export const resolveConfig = () => {
    return {
        cwd: process.cwd(),
    }
}
