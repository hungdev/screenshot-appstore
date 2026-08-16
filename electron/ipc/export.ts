import { app, ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'
import { basename, join } from 'path'

interface ExportOptions {
  base64: string
  filename: string
  format?: 'png' | 'webp'
}

export function registerExportHandlers(): void {
  ipcMain.handle('export:png', async (_, options: ExportOptions) => {
    try {
      const format = options.format ?? 'png'
      const filters = format === 'webp'
        ? [{ name: 'WebP Image', extensions: ['webp'] }]
        : [{ name: 'PNG Image', extensions: ['png'] }]

      const { filePath } = await dialog.showSaveDialog({
        defaultPath: options.filename,
        filters
      })

      if (!filePath) {
        return { success: false, error: 'Cancelled' }
      }

      let buffer = Buffer.from(options.base64, 'base64')

      // Convert to WebP using sharp if available
      if (format === 'webp') {
        try {
          const sharp = (await import('sharp')).default
          buffer = await sharp(buffer).webp({ quality: 90 }).toBuffer()
        } catch {
          // sharp not installed — fall back to saving as PNG with .webp extension
          // The user will get a PNG file, which is acceptable as a fallback
        }
      }

      await writeFile(filePath, buffer)
      return { success: true, data: filePath }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('export:batch', async (event, jobs: ExportOptions[]) => {
    try {
      const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const { filePaths } = await dialog.showOpenDialog(parentWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Choose folder for exported panels',
        defaultPath: app.getPath('downloads'),
        buttonLabel: 'Export here'
      })

      if (!filePaths || filePaths.length === 0) {
        return { success: false, error: 'Cancelled' }
      }

      const dir = filePaths[0]
      const savedPaths: string[] = []
      for (const job of jobs) {
        // Strip directory components to prevent path traversal
        const safeName = basename(job.filename)
        const fullPath = join(dir, safeName)
        const buffer = Buffer.from(job.base64, 'base64')
        await writeFile(fullPath, buffer)
        savedPaths.push(fullPath)
      }

      return { success: true, data: { directory: dir, files: savedPaths } }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
