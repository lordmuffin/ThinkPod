import { logger } from './logger';

export interface ChunkOptions {
  maxChunkSize?: number;
  chunkOverlap?: number;
  preserveSentences?: boolean;
  preserveParagraphs?: boolean;
  minChunkSize?: number;
  separators?: string[];
}

export interface TextChunk {
  content: string;
  chunk_index: number;
  start_position: number;
  end_position: number;
  content_tokens: number;
  metadata: {
    word_count: number;
    character_count: number;
    paragraph_index?: number;
    section_title?: string;
    chunk_type: 'paragraph' | 'sentence' | 'arbitrary';
  };
}

export class TextChunker {
  private defaultOptions: Required<ChunkOptions> = {
    maxChunkSize: 1000, // Characters, roughly 250 tokens
    chunkOverlap: 100, // Characters
    preserveSentences: true,
    preserveParagraphs: true,
    minChunkSize: 100,
    separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' ']
  };

  /**
   * Split text into intelligent chunks
   */
  chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
    const opts = { ...this.defaultOptions, ...options };
    
    if (!text || text.trim().length === 0) {
      return [];
    }

    const cleanedText = this.preprocessText(text);
    
    let chunks: TextChunk[];
    
    // Try different chunking strategies based on preferences
    if (opts.preserveParagraphs) {
      chunks = this.chunkByParagraphs(cleanedText, opts);
    } else if (opts.preserveSentences) {
      chunks = this.chunkBySentences(cleanedText, opts);
    } else {
      chunks = this.chunkBySize(cleanedText, opts);
    }

    // Post-process chunks to ensure quality
    chunks = this.postProcessChunks(chunks, opts);
    
    // Add final metadata
    chunks = chunks.map((chunk, index) => ({
      ...chunk,
      chunk_index: index,
      content_tokens: this.estimateTokens(chunk.content)
    }));

    logger.debug('Text chunking completed', {
      originalLength: text.length,
      cleanedLength: cleanedText.length,
      chunkCount: chunks.length,
      avgChunkSize: Math.round(chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunks.length),
      strategy: opts.preserveParagraphs ? 'paragraphs' : opts.preserveSentences ? 'sentences' : 'size'
    });

    return chunks;
  }

  /**
   * Chunk text by paragraphs with size constraints
   */
  private chunkByParagraphs(text: string, options: Required<ChunkOptions>): TextChunk[] {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const chunks: TextChunk[] = [];
    let currentChunk = '';
    let currentStart = 0;
    let paragraphIndex = 0;

    for (const paragraph of paragraphs) {
      const trimmedParagraph = paragraph.trim();
      
      // If adding this paragraph would exceed max size, finalize current chunk
      if (currentChunk.length > 0 && 
          currentChunk.length + trimmedParagraph.length + 2 > options.maxChunkSize) {
        
        // Add current chunk
        chunks.push(this.createChunk(
          currentChunk.trim(),
          chunks.length,
          currentStart,
          currentStart + currentChunk.length,
          'paragraph',
          { paragraph_index: paragraphIndex - 1 }
        ));

        // Start new chunk with overlap
        const overlap = this.getOverlapText(currentChunk, options.chunkOverlap);
        currentChunk = overlap ? overlap + '\n\n' + trimmedParagraph : trimmedParagraph;
        currentStart = this.findTextPosition(text, trimmedParagraph);
      } else {
        // Add paragraph to current chunk
        if (currentChunk.length > 0) {
          currentChunk += '\n\n' + trimmedParagraph;
        } else {
          currentChunk = trimmedParagraph;
          currentStart = this.findTextPosition(text, trimmedParagraph);
        }
      }
      
      paragraphIndex++;
    }

    // Add final chunk if it exists
    if (currentChunk.trim().length >= options.minChunkSize) {
      chunks.push(this.createChunk(
        currentChunk.trim(),
        chunks.length,
        currentStart,
        currentStart + currentChunk.length,
        'paragraph',
        { paragraph_index: paragraphIndex - 1 }
      ));
    }

    return chunks;
  }

  /**
   * Chunk text by sentences with size constraints
   */
  private chunkBySentences(text: string, options: Required<ChunkOptions>): TextChunk[] {
    const sentences = this.splitIntoSentences(text);
    const chunks: TextChunk[] = [];
    let currentChunk = '';
    let currentStart = 0;

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      
      // If adding this sentence would exceed max size, finalize current chunk
      if (currentChunk.length > 0 && 
          currentChunk.length + trimmedSentence.length + 1 > options.maxChunkSize) {
        
        // Add current chunk
        chunks.push(this.createChunk(
          currentChunk.trim(),
          chunks.length,
          currentStart,
          currentStart + currentChunk.length,
          'sentence'
        ));

        // Start new chunk with overlap
        const overlap = this.getOverlapText(currentChunk, options.chunkOverlap);
        currentChunk = overlap ? overlap + ' ' + trimmedSentence : trimmedSentence;
        currentStart = this.findTextPosition(text, trimmedSentence);
      } else {
        // Add sentence to current chunk
        if (currentChunk.length > 0) {
          currentChunk += ' ' + trimmedSentence;
        } else {
          currentChunk = trimmedSentence;
          currentStart = this.findTextPosition(text, trimmedSentence);
        }
      }
    }

    // Add final chunk if it exists
    if (currentChunk.trim().length >= options.minChunkSize) {
      chunks.push(this.createChunk(
        currentChunk.trim(),
        chunks.length,
        currentStart,
        currentStart + currentChunk.length,
        'sentence'
      ));
    }

    return chunks;
  }

  /**
   * Chunk text by size without regard to structure
   */
  private chunkBySize(text: string, options: Required<ChunkOptions>): TextChunk[] {
    const chunks: TextChunk[] = [];
    let position = 0;

    while (position < text.length) {
      let chunkEnd = Math.min(position + options.maxChunkSize, text.length);
      
      // Try to break at a reasonable boundary
      if (chunkEnd < text.length) {
        const boundary = this.findBestBreakpoint(text, position, chunkEnd, options.separators);
        if (boundary > position + options.minChunkSize) {
          chunkEnd = boundary;
        }
      }

      const chunkContent = text.substring(position, chunkEnd).trim();
      
      if (chunkContent.length >= options.minChunkSize) {
        chunks.push(this.createChunk(
          chunkContent,
          chunks.length,
          position,
          chunkEnd,
          'arbitrary'
        ));
      }

      // Move position forward with overlap
      position = Math.max(chunkEnd - options.chunkOverlap, position + 1);
    }

    return chunks;
  }

  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    // Enhanced sentence splitting that handles common abbreviations
    const abbreviations = new Set([
      'Dr', 'Mr', 'Mrs', 'Ms', 'Prof', 'Sr', 'Jr', 'vs', 'etc', 'Inc', 'Ltd', 'Corp'
    ]);

    const sentences: string[] = [];
    let current = '';
    let i = 0;

    while (i < text.length) {
      const char = text[i];
      current += char;

      if (['.', '!', '?'].includes(char)) {
        // Check if this is likely the end of a sentence
        if (this.isSentenceEnd(text, i, abbreviations)) {
          sentences.push(current.trim());
          current = '';
        }
      }

      i++;
    }

    if (current.trim()) {
      sentences.push(current.trim());
    }

    return sentences.filter(s => s.length > 0);
  }

  /**
   * Check if a period/punctuation marks the end of a sentence
   */
  private isSentenceEnd(text: string, position: number, abbreviations: Set<string>): boolean {
    // Look ahead for whitespace and capital letter
    let nextNonSpace = position + 1;
    while (nextNonSpace < text.length && /\s/.test(text[nextNonSpace])) {
      nextNonSpace++;
    }

    // If no character follows, it's sentence end
    if (nextNonSpace >= text.length) return true;

    // If next character is not capital, probably not sentence end
    if (!/[A-Z]/.test(text[nextNonSpace])) return false;

    // Check for abbreviations before the punctuation
    const wordBefore = this.getWordBefore(text, position);
    if (abbreviations.has(wordBefore)) return false;

    return true;
  }

  /**
   * Get the word before a given position
   */
  private getWordBefore(text: string, position: number): string {
    let start = position - 1;
    while (start >= 0 && /\s/.test(text[start])) {
      start--;
    }
    
    let wordStart = start;
    while (wordStart >= 0 && /[a-zA-Z]/.test(text[wordStart])) {
      wordStart--;
    }
    
    return text.substring(wordStart + 1, start + 1);
  }

  /**
   * Find the best breakpoint for chunking
   */
  private findBestBreakpoint(text: string, start: number, maxEnd: number, separators: string[]): number {
    for (const separator of separators) {
      const lastIndex = text.lastIndexOf(separator, maxEnd);
      if (lastIndex > start) {
        return lastIndex + separator.length;
      }
    }
    return maxEnd;
  }

  /**
   * Get overlap text from the end of a chunk
   */
  private getOverlapText(text: string, overlapSize: number): string {
    if (text.length <= overlapSize) return text;
    
    const overlap = text.substring(text.length - overlapSize);
    
    // Try to start overlap at sentence boundary
    const sentenceStart = overlap.search(/[.!?]\s+/);
    if (sentenceStart !== -1 && sentenceStart < overlapSize / 2) {
      return overlap.substring(sentenceStart + 2);
    }
    
    // Try to start overlap at word boundary
    const spaceIndex = overlap.indexOf(' ');
    if (spaceIndex !== -1) {
      return overlap.substring(spaceIndex + 1);
    }
    
    return overlap;
  }

  /**
   * Find the position of text within a larger string
   */
  private findTextPosition(fullText: string, searchText: string): number {
    const index = fullText.indexOf(searchText.substring(0, Math.min(50, searchText.length)));
    return index !== -1 ? index : 0;
  }

  /**
   * Create a text chunk object
   */
  private createChunk(
    content: string,
    index: number,
    start: number,
    end: number,
    type: 'paragraph' | 'sentence' | 'arbitrary',
    extraMetadata: Record<string, any> = {}
  ): TextChunk {
    return {
      content,
      chunk_index: index,
      start_position: start,
      end_position: end,
      content_tokens: 0, // Will be calculated later
      metadata: {
        word_count: this.countWords(content),
        character_count: content.length,
        chunk_type: type,
        ...extraMetadata
      }
    };
  }

  /**
   * Post-process chunks to ensure quality
   */
  private postProcessChunks(chunks: TextChunk[], options: Required<ChunkOptions>): TextChunk[] {
    return chunks
      .filter(chunk => chunk.content.trim().length >= options.minChunkSize)
      .map((chunk, index) => ({
        ...chunk,
        chunk_index: index,
        content: chunk.content.trim()
      }));
  }

  /**
   * Preprocess text before chunking
   */
  private preprocessText(text: string): string {
    return text
      // Normalize whitespace
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove excessive whitespace
      .replace(/[ \t]+/g, ' ')
      // Normalize multiple newlines but preserve paragraph breaks
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Estimate token count for text (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Get chunking statistics
   */
  getChunkingStats(chunks: TextChunk[]): {
    total_chunks: number;
    total_characters: number;
    total_tokens: number;
    avg_chunk_size: number;
    avg_tokens_per_chunk: number;
    min_chunk_size: number;
    max_chunk_size: number;
  } {
    if (chunks.length === 0) {
      return {
        total_chunks: 0,
        total_characters: 0,
        total_tokens: 0,
        avg_chunk_size: 0,
        avg_tokens_per_chunk: 0,
        min_chunk_size: 0,
        max_chunk_size: 0
      };
    }

    const sizes = chunks.map(chunk => chunk.content.length);
    const tokens = chunks.map(chunk => chunk.content_tokens);

    return {
      total_chunks: chunks.length,
      total_characters: sizes.reduce((sum, size) => sum + size, 0),
      total_tokens: tokens.reduce((sum, token) => sum + token, 0),
      avg_chunk_size: Math.round(sizes.reduce((sum, size) => sum + size, 0) / chunks.length),
      avg_tokens_per_chunk: Math.round(tokens.reduce((sum, token) => sum + token, 0) / chunks.length),
      min_chunk_size: Math.min(...sizes),
      max_chunk_size: Math.max(...sizes)
    };
  }
}