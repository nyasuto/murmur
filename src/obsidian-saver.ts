import * as fs from 'fs-extra';
import * as path from 'path';
import SettingsManager from './settings-manager';

interface SaveOptions {
  fileName?: string;
  title?: string;
  subfolder?: string;
  language?: string;
}

interface SaveResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  message?: string;
  error?: string;
}

interface FileMetadata {
  fileName: string;
  createdAt: string;
  vaultPath: string;
  title?: string;
  language?: string;
}

interface FrontMatterData {
  created: string;
  tags: string[];
  type: string;
  source: string;
  title?: string;
  language?: string;
}

interface VoiceMemoFile {
  name: string;
  path: string;
  size: number;
  created: Date;
  modified: Date;
}

interface ListOptions {
  subfolder?: string;
}

interface ListResult {
  success: boolean;
  files?: VoiceMemoFile[];
  count?: number;
  error?: string;
}

interface DeleteOptions {
  subfolder?: string;
}

interface DeleteResult {
  success: boolean;
  message?: string;
  error?: string;
}

class ObsidianSaver {
  private readonly settingsManager: SettingsManager;

  constructor(settingsManager: SettingsManager) {
    this.settingsManager = settingsManager;
  }

  /**
   * Save formatted text to Obsidian vault
   */
  async saveToVault(content: string, options: SaveOptions = {}): Promise<SaveResult> {
    try {
      const settings = await this.settingsManager.loadSettings();

      if (!settings.obsidianVaultPath) {
        return {
          success: false,
          error: 'Obsidian vault path not configured',
        };
      }

      // Validate vault path
      const validation = await this.settingsManager.validateObsidianVault(
        settings.obsidianVaultPath
      );
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid vault path: ${validation.error}`,
        };
      }

      // Generate filename
      const fileName =
        options.fileName ||
        this.settingsManager.generateFileName({
          format: settings.fileNameFormat,
          title: options.title,
        });

      // Determine save location
      let savePath: string;
      if (options.subfolder) {
        const subfolderPath = path.join(validation.path!, options.subfolder);
        await fs.ensureDir(subfolderPath);
        savePath = path.join(subfolderPath, fileName);
      } else {
        savePath = path.join(validation.path!, fileName);
      }

      // Check if file already exists and handle duplicates
      let finalSavePath = savePath;
      let counter = 1;
      while (await fs.pathExists(finalSavePath)) {
        const { name, ext } = path.parse(savePath);
        finalSavePath = path.join(path.dirname(savePath), `${name}-${counter}${ext}`);
        counter++;
      }

      // Prepare final content with metadata
      const finalContent = this.prepareContent(content, {
        fileName: path.basename(finalSavePath),
        createdAt: new Date().toISOString(),
        vaultPath: settings.obsidianVaultPath,
        ...options,
      });

      // Save file
      await fs.writeFile(finalSavePath, finalContent, 'utf8');

      return {
        success: true,
        filePath: finalSavePath,
        fileName: path.basename(finalSavePath),
        message: 'File saved successfully to Obsidian vault',
      };
    } catch (error) {
      console.error('Failed to save to Obsidian vault:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Prepare content with metadata and formatting
   */
  private prepareContent(content: string, metadata: FileMetadata): string {
    const frontMatter = this.generateFrontMatter(metadata);

    // Add front matter if content doesn't already have it
    if (!content.startsWith('---')) {
      return `${frontMatter}\n${content}`;
    }

    return content;
  }

  /**
   * Generate front matter for Obsidian
   */
  private generateFrontMatter(metadata: FileMetadata): string {
    const frontMatterData: FrontMatterData = {
      created: metadata.createdAt,
      tags: ['voice-memo', 'murmur'],
      type: 'voice-memo',
      source: 'Murmur App',
    };

    // Add additional metadata if provided
    if (metadata.title) {
      frontMatterData.title = metadata.title;
    }

    if (metadata.language) {
      frontMatterData.language = metadata.language;
    }

    // Convert to YAML front matter
    const frontMatterLines = ['---'];
    Object.entries(frontMatterData).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        frontMatterLines.push(`${key}:`);
        value.forEach(item => frontMatterLines.push(`  - ${item}`));
      } else {
        frontMatterLines.push(`${key}: ${value}`);
      }
    });
    frontMatterLines.push('---');

    return frontMatterLines.join('\n');
  }

  /**
   * List existing voice memos in vault
   */
  async listVoiceMemos(options: ListOptions = {}): Promise<ListResult> {
    try {
      const settings = await this.settingsManager.loadSettings();

      if (!settings.obsidianVaultPath) {
        return {
          success: false,
          error: 'Obsidian vault path not configured',
        };
      }

      const validation = await this.settingsManager.validateObsidianVault(
        settings.obsidianVaultPath
      );
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      // Search for voice memo files
      const searchPath = options.subfolder
        ? path.join(validation.path!, options.subfolder)
        : validation.path!;

      const files: VoiceMemoFile[] = [];

      if (await fs.pathExists(searchPath)) {
        const dirEntries = await fs.readdir(searchPath, { withFileTypes: true });

        for (const entry of dirEntries) {
          if (entry.isFile() && entry.name.endsWith('.md')) {
            const filePath = path.join(searchPath, entry.name);
            const stats = await fs.stat(filePath);

            // Check if it's a voice memo by reading content
            const content = await fs.readFile(filePath, 'utf8');
            if (content.includes('voice-memo') || content.includes('murmur')) {
              files.push({
                name: entry.name,
                path: filePath,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
              });
            }
          }
        }
      }

      // Sort by creation date (newest first)
      files.sort((a, b) => b.created.getTime() - a.created.getTime());

      return {
        success: true,
        files,
        count: files.length,
      };
    } catch (error) {
      console.error('Failed to list voice memos:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Delete a voice memo file
   */
  async deleteVoiceMemo(fileName: string, options: DeleteOptions = {}): Promise<DeleteResult> {
    try {
      const settings = await this.settingsManager.loadSettings();

      if (!settings.obsidianVaultPath) {
        return {
          success: false,
          error: 'Obsidian vault path not configured',
        };
      }

      const validation = await this.settingsManager.validateObsidianVault(
        settings.obsidianVaultPath
      );
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      const filePath = options.subfolder
        ? path.join(validation.path!, options.subfolder, fileName)
        : path.join(validation.path!, fileName);

      if (!(await fs.pathExists(filePath))) {
        return {
          success: false,
          error: 'File not found',
        };
      }

      await fs.remove(filePath);

      return {
        success: true,
        message: 'Voice memo deleted successfully',
      };
    } catch (error) {
      console.error('Failed to delete voice memo:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}

export default ObsidianSaver;
