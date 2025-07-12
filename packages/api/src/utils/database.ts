import { Pool, PoolClient, PoolConfig } from 'pg';
import { logger } from './logger';

export class DatabaseConnection {
  private pool: Pool | null = null;
  private isConnected = false;

  constructor() {
    const config: PoolConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'thinkpod_dev',
      user: process.env.DB_USER || 'thinkpod_user',
      password: process.env.DB_PASSWORD || 'thinkpod_password',
      max: parseInt(process.env.DB_POOL_MAX || '20'), // maximum number of connections
      min: parseInt(process.env.DB_POOL_MIN || '5'), // minimum number of connections
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    };

    this.pool = new Pool(config);

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('PostgreSQL pool error:', err);
    });

    this.pool.on('connect', () => {
      logger.info('New PostgreSQL connection established');
    });

    this.pool.on('remove', () => {
      logger.info('PostgreSQL connection removed from pool');
    });
  }

  public async connect(): Promise<void> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    try {
      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.isConnected = true;
      logger.info('Database connection established successfully');
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      logger.info('Database connection closed');
    }
  }

  public async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    if (!this.pool || !this.isConnected) {
      throw new Error('Database not connected');
    }

    const start = Date.now();
    
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Database query executed', {
        query: text,
        duration: `${duration}ms`,
        rows: result.rowCount,
      });
      
      return result.rows;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Database query failed', {
        query: text,
        params,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool || !this.isConnected) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async getClient(): Promise<PoolClient> {
    if (!this.pool || !this.isConnected) {
      throw new Error('Database not connected');
    }
    
    return await this.pool.connect();
  }

  public getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }
    return this.pool;
  }

  public isReady(): boolean {
    return this.isConnected && this.pool !== null;
  }

  // Utility methods for common operations
  public async findById<T = any>(table: string, id: string): Promise<T | null> {
    const result = await this.query<T>(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    return result.length > 0 ? result[0] : null;
  }

  public async findByField<T = any>(table: string, field: string, value: any): Promise<T[]> {
    return await this.query<T>(`SELECT * FROM ${table} WHERE ${field} = $1`, [value]);
  }

  public async findOneByField<T = any>(table: string, field: string, value: any): Promise<T | null> {
    const result = await this.findByField<T>(table, field, value);
    return result.length > 0 ? result[0] : null;
  }

  public async insert<T = any>(table: string, data: Record<string, any>): Promise<T> {
    const fields = Object.keys(data);
    const values = Object.values(data);
    const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
    const fieldsList = fields.join(', ');

    const query = `
      INSERT INTO ${table} (${fieldsList}) 
      VALUES (${placeholders}) 
      RETURNING *
    `;

    const result = await this.query<T>(query, values);
    return result[0];
  }

  public async update<T = any>(
    table: string, 
    id: string, 
    data: Record<string, any>
  ): Promise<T | null> {
    const fields = Object.keys(data);
    const values = Object.values(data);
    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');

    const query = `
      UPDATE ${table} 
      SET ${setClause} 
      WHERE id = $1 
      RETURNING *
    `;

    const result = await this.query<T>(query, [id, ...values]);
    return result.length > 0 ? result[0] : null;
  }

  public async delete(table: string, id: string): Promise<boolean> {
    const result = await this.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    return result.length > 0;
  }

  public async batchInsert<T = any>(
    table: string, 
    dataArray: Record<string, any>[]
  ): Promise<T[]> {
    if (dataArray.length === 0) {
      return [];
    }

    // Get fields from the first object
    const fields = Object.keys(dataArray[0]);
    const fieldsList = fields.join(', ');
    
    // Create value placeholders for each row
    const valuePlaceholders = dataArray.map((_, rowIndex) => {
      const rowPlaceholders = fields.map((_, fieldIndex) => 
        `$${rowIndex * fields.length + fieldIndex + 1}`
      ).join(', ');
      return `(${rowPlaceholders})`;
    }).join(', ');

    // Flatten all values into a single array
    const allValues = dataArray.flatMap(data => fields.map(field => data[field]));

    const query = `
      INSERT INTO ${table} (${fieldsList}) 
      VALUES ${valuePlaceholders} 
      RETURNING *
    `;

    return await this.query<T>(query, allValues);
  }

  // Health check method
  public async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      await this.query('SELECT 1');
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// Create a singleton instance
export const db = new DatabaseConnection();