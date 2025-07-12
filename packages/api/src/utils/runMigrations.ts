import fs from 'fs/promises';
import path from 'path';
import { db } from './database';
import { logger } from './logger';

interface Migration {
  filename: string;
  version: string;
  content: string;
}

class MigrationRunner {
  private migrationsDir: string;

  constructor() {
    this.migrationsDir = path.join(process.cwd(), '../../database/migrations');
  }

  /**
   * Initialize migrations table if it doesn't exist
   */
  private async initializeMigrationsTable(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) UNIQUE NOT NULL,
        filename VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await db.query(createTableQuery);
    logger.info('Migrations table initialized');
  }

  /**
   * Get list of executed migrations
   */
  private async getExecutedMigrations(): Promise<string[]> {
    const result = await db.query<{ version: string }>('SELECT version FROM migrations ORDER BY executed_at');
    return result.map(row => row.version);
  }

  /**
   * Load migration files from disk
   */
  private async loadMigrationFiles(): Promise<Migration[]> {
    try {
      const files = await fs.readdir(this.migrationsDir);
      const sqlFiles = files.filter(file => file.endsWith('.sql')).sort();

      const migrations: Migration[] = [];

      for (const filename of sqlFiles) {
        const filePath = path.join(this.migrationsDir, filename);
        const content = await fs.readFile(filePath, 'utf-8');
        
        // Extract version from filename (e.g., "001_initial_schema.sql" -> "001")
        const version = filename.split('_')[0];
        
        migrations.push({
          filename,
          version,
          content
        });
      }

      return migrations;
    } catch (error) {
      logger.error('Failed to load migration files:', error);
      throw error;
    }
  }

  /**
   * Execute a single migration
   */
  private async executeMigration(migration: Migration): Promise<void> {
    logger.info(`Executing migration: ${migration.filename}`);

    try {
      // Execute the migration in a transaction
      await db.transaction(async (client) => {
        // Execute the migration SQL
        await client.query(migration.content);
        
        // Record the migration as executed
        await client.query(
          'INSERT INTO migrations (version, filename) VALUES ($1, $2)',
          [migration.version, migration.filename]
        );
      });

      logger.info(`Migration ${migration.filename} executed successfully`);
    } catch (error) {
      logger.error(`Migration ${migration.filename} failed:`, error);
      throw error;
    }
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<void> {
    try {
      logger.info('Starting database migrations...');

      // Connect to database
      await db.connect();

      // Initialize migrations tracking table
      await this.initializeMigrationsTable();

      // Get executed migrations
      const executedMigrations = await this.getExecutedMigrations();
      logger.info(`Found ${executedMigrations.length} executed migrations`);

      // Load migration files
      const allMigrations = await this.loadMigrationFiles();
      logger.info(`Found ${allMigrations.length} migration files`);

      // Filter pending migrations
      const pendingMigrations = allMigrations.filter(
        migration => !executedMigrations.includes(migration.version)
      );

      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations to execute');
        return;
      }

      logger.info(`Found ${pendingMigrations.length} pending migrations`);

      // Execute pending migrations
      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
      }

      logger.info(`Successfully executed ${pendingMigrations.length} migrations`);

    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<{
    executed: string[];
    pending: string[];
    total: number;
  }> {
    try {
      await db.connect();
      await this.initializeMigrationsTable();

      const executedMigrations = await this.getExecutedMigrations();
      const allMigrations = await this.loadMigrationFiles();
      
      const pendingMigrations = allMigrations
        .filter(migration => !executedMigrations.includes(migration.version))
        .map(migration => migration.filename);

      return {
        executed: executedMigrations,
        pending: pendingMigrations,
        total: allMigrations.length
      };
    } catch (error) {
      logger.error('Failed to get migration status:', error);
      throw error;
    }
  }
}

// CLI execution
if (require.main === module) {
  async function main() {
    const runner = new MigrationRunner();
    
    try {
      const args = process.argv.slice(2);
      
      if (args.includes('--status')) {
        const status = await runner.getMigrationStatus();
        console.log('Migration Status:');
        console.log(`Total migrations: ${status.total}`);
        console.log(`Executed: ${status.executed.length}`);
        console.log(`Pending: ${status.pending.length}`);
        
        if (status.pending.length > 0) {
          console.log('\nPending migrations:');
          status.pending.forEach(filename => console.log(`  - ${filename}`));
        }
      } else {
        await runner.runMigrations();
        console.log('✅ All migrations completed successfully');
      }
    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    } finally {
      await db.disconnect();
      process.exit(0);
    }
  }

  main();
}

export { MigrationRunner };