import { useNavigate, useParams } from 'react-router-dom';
import { HiArrowLeft, HiPlus, HiX, HiOutlinePencil, HiDocumentText } from 'react-icons/hi';
import Sidebar from '../components/Sidebar';
import Dropdown from '../components/Dropdown';
import { useState, useEffect, useCallback } from 'react';
import { showToast } from '../components/ToastNotification';
import { documentAPI, getErrorMessage } from '../services/api';

const parseMarkdownTableSheets = (inputText = '') => {
  const text = String(inputText || '');
  if (!text.trim()) return [];

  const parseTableLines = (tableLines, sheetName, fallbackIndex) => {
    if (!Array.isArray(tableLines) || tableLines.length < 2) return null;
    const rows = tableLines
      .map((line) => {
        const safeLine = String(line || '').trim().replace(/\\\|/g, '__PIPE__');
        if (!safeLine.startsWith('|') || !safeLine.endsWith('|')) return [];
        return safeLine
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim().replace(/__PIPE__/g, '|'));
      })
      .filter((row) => row.length > 0);
    if (rows.length < 2) return null;

    const columns = rows[0].map((cell) => String(cell || '').trim());
    if (!columns.length || columns.every((cell) => !cell)) return null;

    let bodyRows = rows.slice(1);
    if (
      bodyRows.length > 0 &&
      bodyRows[0].length === columns.length &&
      bodyRows[0].every((cell) => /^:?-{3,}:?$/.test(String(cell || '').trim()))
    ) {
      bodyRows = bodyRows.slice(1);
    }

    const rowObjects = bodyRows.map((row) => {
      const output = {};
      columns.forEach((column, colIdx) => {
        output[column] = String(row[colIdx] ?? '');
      });
      return output;
    });

    return {
      name: sheetName || `Sheet ${fallbackIndex + 1}`,
      columns,
      rows: rowObjects,
    };
  };

  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const sheets = [];
  let currentSheetName = 'Sheet 1';
  let tableBuffer = [];

  const flushBuffer = () => {
    const parsed = parseTableLines(tableBuffer, currentSheetName, sheets.length);
    if (parsed) sheets.push(parsed);
    tableBuffer = [];
  };

  lines.forEach((line) => {
    const sheetMatch = line.match(/^#{1,6}\s*Sheet:\s*(.+)$/i);
    if (sheetMatch) {
      flushBuffer();
      currentSheetName = sheetMatch[1].trim() || `Sheet ${sheets.length + 1}`;
      return;
    }
    if (/^\|.+\|$/.test(line)) {
      tableBuffer.push(line);
      return;
    }
    flushBuffer();
  });
  flushBuffer();

  return sheets;
};

function AddKnowledgeData() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [dataContent, setDataContent] = useState('');
  const [dataType, setDataType] = useState('file');
  const [textFileName, setTextFileName] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingFile, setEditingFile] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewEditMode, setPreviewEditMode] = useState(false);
  const [previewAiStructuring, setPreviewAiStructuring] = useState(false);
  const [selectedPreviewChunks, setSelectedPreviewChunks] = useState([]);
  const [previewTableSheets, setPreviewTableSheets] = useState([]);
  const [previewActiveSheetIdx, setPreviewActiveSheetIdx] = useState(0);
  const [expandedCellEditor, setExpandedCellEditor] = useState(null);
  const [fileError, setFileError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [document, setDocument] = useState(null);

  const loadDocument = useCallback(async () => {
    if (!id) return;

    try {
      const doc = await documentAPI.getDocument(id);
      setDocument(doc);
      // Backend may return sourceFiles as array or JSON string
      let rawSourceFiles = doc.sourceFiles;
      if (typeof rawSourceFiles === 'string') {
        try {
          rawSourceFiles = JSON.parse(rawSourceFiles);
        } catch {
          rawSourceFiles = [];
        }
      }
      if (Array.isArray(rawSourceFiles) && rawSourceFiles.length > 0) {
        const files = rawSourceFiles.map((file, index) => {
          const blocks = file.blocks || (file.text ? [{ text: file.text, label: 'Content' }] : []);
          const fromBlocks =
            !file.text?.trim() && Array.isArray(blocks) && blocks.length
              ? blocks.map((b) => (b?.text ?? '').trim()).filter(Boolean).join('\n\n').trim()
              : '';
          const fileText = typeof file.text === 'string' ? file.text : '';
          const text = fileText.trim() ? fileText : fromBlocks;
          const metadata = file.metadata && typeof file.metadata === 'object' ? { ...file.metadata } : {};
          if (!Array.isArray(metadata.previewSheets) || metadata.previewSheets.length === 0) {
            const recoveredSheets = parseMarkdownTableSheets(text);
            if (recoveredSheets.length > 0) {
              metadata.previewSheets = recoveredSheets;
            }
          }
          return {
            id: `existing-${index}`,
            name: file.name || file.fileName || `File ${index + 1}`,
            fileName: file.fileName || file.name || `File ${index + 1}`,
            type: 'file',
            content: text,
            text,
            blocks,
            metadata,
            structuredText: file.structuredText || '',
            pages: Array.isArray(file.pages) ? file.pages : [],
            existing: true,
            originalSourceFile: file,
          };
        });
        setUploadedFiles(files);
      } else {
        setUploadedFiles([]);
      }
    } catch (err) {
      console.error('Error loading document:', err);
      showToast(getErrorMessage(err), 'error');
      setError(getErrorMessage(err));
      setUploadedFiles([]);
    }
  }, [id]);

  // Load document on mount and when id changes
  useEffect(() => {
    if (id) {
      // Clear all state when switching to different knowledge
      setUploadedFiles([]);
      setDataContent('');
      setTextFileName('');
      setError(null);
      setDocument(null);
      loadDocument();
    }
  }, [id, loadDocument]);

  // Process pending OCR files when id becomes available
  useEffect(() => {
    if (id && uploadedFiles.length > 0) {
      // Find files that need OCR but haven't been processed yet
      const pendingFiles = uploadedFiles.filter(file => 
        file.needsOCR && 
        !file.processingOCR && 
        !file.text && 
        !file.blocks && 
        file.file instanceof File
      );
      
      if (pendingFiles.length > 0) {
        pendingFiles.forEach(file => {
          const fileId = file.id;
          setUploadedFiles(prevFiles => 
            prevFiles.map(f => 
              f.id === fileId ? { ...f, processingOCR: true } : f
            )
          );
          showToast(`กำลังประมวลผลไฟล์ ${file.name} ด้วย OCR...`, 'info');
          processFileWithOCR(id, file.file, fileId);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]); // Only run when id changes, not when uploadedFiles changes to avoid infinite loop

  // Get file type icon and label
  const getFileTypeInfo = (fileName) => {
    const extension = fileName.toLowerCase().split('.').pop();
    const typeMap = {
      'pdf': { icon: '📄', label: 'PDF', color: 'text-red-600' },
      'png': { icon: '🖼️', label: 'Image', color: 'text-blue-600' },
      'jpg': { icon: '🖼️', label: 'Image', color: 'text-blue-600' },
      'jpeg': { icon: '🖼️', label: 'Image', color: 'text-blue-600' },
      'gif': { icon: '🖼️', label: 'Image', color: 'text-blue-600' },
      'txt': { icon: '📝', label: 'Text', color: 'text-gray-600' },
      'doc': { icon: '📘', label: 'Word', color: 'text-blue-700' },
      'docx': { icon: '📘', label: 'Word', color: 'text-blue-700' },
      'xlsx': { icon: '📊', label: 'Excel', color: 'text-green-700' },
      'xls': { icon: '📊', label: 'Excel', color: 'text-green-700' },
      'csv': { icon: '📑', label: 'CSV', color: 'text-emerald-700' },
    };
    return typeMap[extension] || { icon: '📎', label: extension.toUpperCase(), color: 'text-gray-600' };
  };

  // Get PDF page count from OCR result (if available)
  const getPDFPageCount = (file) => {
    // Check if OCR result contains page information
    if (file.pages && Array.isArray(file.pages) && file.pages.length > 0) {
      return file.pages.length;
    }
    // Check if blocks contain page info
    if (file.blocks && Array.isArray(file.blocks)) {
      const pageBlocks = file.blocks.filter(b => b.page);
      if (pageBlocks.length > 0) {
        const maxPage = Math.max(...pageBlocks.map(b => b.page || 0));
        return maxPage;
      }
    }
    return null;
  };

  // Format processing time
  const formatProcessingTime = (seconds) => {
    if (!seconds) return null;
    if (seconds < 60) {
      return `${Math.round(seconds)} วินาที`;
    }
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes} นาที ${secs} วินาที`;
  };

  // Process file with OCR
  const processFileWithOCR = async (documentId, file, fileId) => {
    const startTime = Date.now();
    
    try {
      const result = await documentAPI.processFileWithOCR(documentId, file);
      const processingTime = (Date.now() - startTime) / 1000; // in seconds
      
      const hasText = (result.text && result.text.trim()) || (result.blocks && result.blocks.length > 0);
      if (result.ok && hasText) {
        const text = (result.text || '').trim() || (result.blocks || []).map(b => b.text || '').join('\n\n').trim();
        const pageCount = result.pages && Array.isArray(result.pages) ? result.pages.length : null;
        const blocks = result.blocks && result.blocks.length > 0 ? result.blocks : (text ? [{ text, label: 'Content' }] : []);

        setUploadedFiles(prevFiles =>
          prevFiles.map(f =>
            f.id === fileId
              ? {
                  ...f,
                  content: text,
                  text,
                  blocks,
                  pages: result.pages || f.pages,
                  metadata: result.metadata || f.metadata,
                  needsOCR: false,
                  processingOCR: false,
                  processingTime: processingTime,
                  pageCount: pageCount || f.pageCount || (result.pages ? result.pages.length : null),
                }
              : f
          )
        );
        showToast('ประมวลผลไฟล์สำเร็จ', 'success');
      } else if (result.ok && !hasText) {
        throw new Error('ไม่พบข้อความในไฟล์ที่อัปโหลด');
      } else {
        throw new Error(result.error || 'OCR processing failed');
      }
    } catch (err) {
      console.error('OCR processing error:', err);
      const errorMsg = getErrorMessage(err);
      const processingTime = (Date.now() - startTime) / 1000;
      
      // Update file to show error state
      setUploadedFiles(prevFiles => 
        prevFiles.map(f => 
          f.id === fileId 
            ? {
                ...f,
                needsOCR: true,
                processingOCR: false,
                ocrError: errorMsg,
                processingTime: processingTime
              }
            : f
        )
      );
      showToast(`ประมวลผลไฟล์ไม่สำเร็จ: ${errorMsg}`, 'error');
    }
  };

  const dataTypeOptions = [
    { value: 'file', label: 'File' },
    { value: 'text', label: 'Text' },
  ];

  const isSupportedUploadFile = (file) => {
    if (!file) return false;
    const name = String(file.name || '').toLowerCase();
    const type = String(file.type || '').toLowerCase();
    return (
      name.endsWith('.pdf') ||
      name.endsWith('.xlsx') ||
      name.endsWith('.xls') ||
      name.endsWith('.csv') ||
      type === 'application/pdf' ||
      type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      type === 'application/vnd.ms-excel' ||
      type === 'text/csv'
    );
  };

  // ตรวจสอบไฟล์ก่อนเพิ่ม
  const validateFile = (file) => {
    const maxSize = 5 * 1024 * 1024; // 5 MB in bytes
    
    if (!file) {
      return { valid: false, message: 'กรุณาเลือกไฟล์' };
    }

    if (!isSupportedUploadFile(file)) {
      return { 
        valid: false, 
        message: 'รองรับไฟล์ PDF, XLSX, XLS และ CSV เท่านั้น' 
      };
    }

    if (file.size > maxSize) {
      return { 
        valid: false, 
        message: `ขนาดไฟล์เกิน 5 MB (ขนาดไฟล์: ${(file.size / 1024 / 1024).toFixed(2)} MB)` 
      };
    }

    return { valid: true, message: '' };
  };

  const handleFileAdd = async (file) => {
    // ตรวจสอบว่าเป็น File object หรือไม่
    if (file instanceof File) {
      const validation = validateFile(file);
      if (!validation.valid) {
        setFileError(validation.message);
        return;
      }
    }

    setFileError(''); // Clear error if valid
    const fileSize = file instanceof File ? file.size : null;
    const fileSizeMB = fileSize ? (fileSize / 1024 / 1024).toFixed(2) : null;
    
    // For text files, create file object directly
    if (dataType === 'text' && dataContent) {
      const newFile = { 
        id: Date.now(), 
        name: file.name || textFileName || 'text-file.txt', 
        type: 'text',
        content: dataContent,
        text: dataContent,
        blocks: [
          {
            text: dataContent,
            label: 'Content'
          }
        ]
      };
      setUploadedFiles([...uploadedFiles, newFile]);
      setDataContent('');
      setTextFileName('');
      return;
    }
    
    // For actual file uploads
    if (file instanceof File) {
      if (!isSupportedUploadFile(file)) {
        setFileError('รองรับไฟล์ PDF, XLSX, XLS และ CSV เท่านั้น');
        return;
      }
      
      const fileId = Date.now();
      const fileTypeInfo = getFileTypeInfo(file.name);
      const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      
      const newFile = {
        id: fileId,
        name: file.name,
        type: 'file',
        file: file, // Store File object for OCR processing
        size: fileSize,
        sizeMB: fileSizeMB,
        fileType: fileTypeInfo.label,
        fileIcon: fileTypeInfo.icon,
        isPDF,
        needsOCR: true, // Flag that this needs OCR processing
        processingOCR: true, // Track OCR processing state
        processingStartTime: Date.now()
      };
      setUploadedFiles([...uploadedFiles, newFile]);
      showToast(`กำลังประมวลผลไฟล์ ${file.name}...`, 'info');
      
      // Process file with OCR
      if (id) {
        processFileWithOCR(id, file, fileId);
      } else {
        showToast('กรุณาบันทึก Knowledge Base ก่อนอัพโหลดไฟล์', 'warning');
      }
    } else {
      // Fallback for non-File objects
    const newFile = { 
      id: Date.now(), 
      name: file.name || file, 
      type: dataType,
        content: dataContent || '',
        size: fileSize,
        sizeMB: fileSizeMB
    };
    setUploadedFiles([...uploadedFiles, newFile]);
    setDataContent('');
    }
  };

  const handleDeleteClick = (fileId) => {
    setFileToDelete(fileId);
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (fileToDelete) {
      setUploadedFiles(uploadedFiles.filter(f => f.id !== fileToDelete));
    }
    setIsDeleteConfirmOpen(false);
    setFileToDelete(null);
  };

  const handleCancelDelete = () => {
    setIsDeleteConfirmOpen(false);
    setFileToDelete(null);
  };

  const flattenBlocksToText = (file) => {
    const t = (file.text || file.content || '').trim();
    if (t) return t;
    const blocks = file.blocks;
    if (!Array.isArray(blocks) || !blocks.length) return '';
    return blocks.map((b) => (b?.text ?? '').trim()).filter(Boolean).join('\n\n').trim();
  };

  const clonePreviewSheets = (sheets = []) =>
    (Array.isArray(sheets) ? sheets : []).map((sheet) => ({
      name: String(sheet?.name || ''),
      columns: Array.isArray(sheet?.columns) ? sheet.columns.map((col) => String(col || '')) : [],
      rows: Array.isArray(sheet?.rows)
        ? sheet.rows.map((row) => {
            const output = {};
            if (row && typeof row === 'object' && !Array.isArray(row)) {
              Object.entries(row).forEach(([key, value]) => {
                output[String(key)] = String(value ?? '');
              });
            }
            return output;
          })
        : [],
    }));

  const hasExcelPreviewSheets = (file) =>
    Array.isArray(file?.metadata?.previewSheets) && file.metadata.previewSheets.length > 0;

  const escapeTableCell = (value) =>
    String(value ?? '')
      .replace(/\|/g, '\\|')
      .replace(/\r?\n/g, ' ')
      .trim();

  const buildSheetMarkdownTable = (sheet = {}) => {
    const columns = Array.isArray(sheet?.columns) ? sheet.columns : [];
    const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
    if (!columns.length) return '';
    const header = `| ${columns.map((col) => escapeTableCell(col)).join(' | ')} |`;
    const separator = `| ${columns.map(() => '---').join(' | ')} |`;
    const body = rows.map((row) => {
      const cells = columns.map((column) => escapeTableCell(row?.[column]));
      return `| ${cells.join(' | ')} |`;
    });
    return [`### Sheet: ${sheet?.name || 'Sheet'}`, header, separator, ...body].join('\n');
  };

  const buildSourceFromPreviewSheets = (sheets = []) => {
    const cleanedSheets = clonePreviewSheets(sheets);
    const lines = [];
    const blocks = [];
    cleanedSheets.forEach((sheet) => {
      const tableText = buildSheetMarkdownTable(sheet);
      if (!tableText) return;
      lines.push(tableText);
      blocks.push({
        label: `${sheet?.name || 'Sheet'} • Table`,
        text: tableText,
      });
    });
    return {
      text: lines.join('\n'),
      blocks,
      previewSheets: cleanedSheets,
    };
  };

  // รวมตาราง (ที่แก้แล้วใน sheet editor) กลับเข้าไปใน "ข้อความเต็ม" โดยคงข้อความ (prose) รอบๆ ตารางไว้
  // แทนที่บล็อกตารางเดิมในข้อความด้วยตารางที่สร้างใหม่ทีละบล็อกตามลำดับ ส่วนบรรทัดที่ไม่ใช่ตารางคงไว้เหมือนเดิม
  const mergeSheetsIntoText = (originalText, sheets) => {
    const src = String(originalText || '');
    const sheetList = Array.isArray(sheets) ? sheets : [];
    if (sheetList.length === 0) return src;
    const isTableLine = (line) => /^\|.+\|$/.test(String(line || '').trim());
    const buildPlainTable = (sheet = {}) => {
      const columns = Array.isArray(sheet?.columns) ? sheet.columns : [];
      const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
      if (!columns.length) return '';
      const header = `| ${columns.map((col) => escapeTableCell(col)).join(' | ')} |`;
      const separator = `| ${columns.map(() => '---').join(' | ')} |`;
      const body = rows.map((row) => `| ${columns.map((column) => escapeTableCell(row?.[column])).join(' | ')} |`);
      return [header, separator, ...body].join('\n');
    };
    const lines = src.split(/\r?\n/);
    const out = [];
    let sheetIdx = 0;
    let i = 0;
    while (i < lines.length) {
      if (isTableLine(lines[i])) {
        const blockLines = [];
        while (i < lines.length && isTableLine(lines[i])) {
          blockLines.push(lines[i]);
          i += 1;
        }
        if (sheetIdx < sheetList.length) {
          const rebuilt = buildPlainTable(sheetList[sheetIdx]);
          out.push(rebuilt || blockLines.join('\n'));
          sheetIdx += 1;
        } else {
          out.push(blockLines.join('\n'));
        }
      } else {
        out.push(lines[i]);
        i += 1;
      }
    }
    return out.join('\n');
  };

  const handleEditFile = (file) => {
    const rows = buildOcrBlockRows(file.blocks);
    const excelSheets = hasExcelPreviewSheets(file) ? clonePreviewSheets(file.metadata.previewSheets) : [];
    setPreviewFile(file);
    setPreviewContent(flattenBlocksToText(file));
    setPreviewTableSheets(excelSheets);
    setPreviewActiveSheetIdx(0);
    setSelectedPreviewChunks(rows.map((r) => r.idx));
    setPreviewEditMode(true);
    setIsPreviewModalOpen(true);
  };

  const handleSaveEdit = () => {
    setUploadedFiles(uploadedFiles.map(f => {
      if (f.id === editingFile.id) {
        const updated = { ...f, content: editContent, text: editContent };
        // Update blocks if content changed
        if (editContent.trim()) {
          updated.blocks = [{ text: editContent, label: 'Content' }];
        } else {
          updated.blocks = [];
        }
        return updated;
      }
      return f;
    }));
    setIsEditModalOpen(false);
    setEditingFile(null);
    setEditContent('');
  };

  const handleCancelEdit = () => {
    setIsEditModalOpen(false);
    setEditingFile(null);
    setEditContent('');
  };

  const handlePreviewFile = (file) => {
    const rows = buildOcrBlockRows(file.blocks);
    const excelSheets = hasExcelPreviewSheets(file) ? clonePreviewSheets(file.metadata.previewSheets) : [];
    setPreviewFile(file);
    setPreviewContent(flattenBlocksToText(file));
    setPreviewTableSheets(excelSheets);
    setPreviewActiveSheetIdx(0);
    setSelectedPreviewChunks(rows.map((r) => r.idx));
    setPreviewEditMode(false);
    setIsPreviewModalOpen(true);
  };

  const handleSavePreviewEdit = () => {
    if (!previewFile) return;
    if (previewTableSheets.length > 0) {
      const cleanedSheets = clonePreviewSheets(previewTableSheets);
      // คงข้อความ (prose) รอบตารางไว้ แล้วแทนเฉพาะบล็อกตารางด้วยตารางที่แก้แล้ว
      const mergedText = mergeSheetsIntoText(previewContent, cleanedSheets);
      const nextBlocks = mergedText.trim() ? [{ text: mergedText, label: 'Content' }] : [];
      setUploadedFiles(prev => prev.map((f) => {
        if (f.id !== previewFile.id) return f;
        return {
          ...f,
          content: mergedText,
          text: mergedText,
          blocks: nextBlocks,
          metadata: {
            ...(f.metadata || {}),
            previewSheets: cleanedSheets,
          },
        };
      }));
      setPreviewFile((prev) => (
        prev
          ? {
              ...prev,
              content: mergedText,
              text: mergedText,
              blocks: nextBlocks,
              metadata: {
                ...(prev.metadata || {}),
                previewSheets: cleanedSheets,
              },
            }
          : null
      ));
      setPreviewContent(mergedText);
      setPreviewTableSheets(cleanedSheets);
      showToast('บันทึกการแก้ไขตารางแล้ว', 'success');
      setPreviewEditMode(false);
      return;
    }
    const trimmed = previewContent.trim();
    const hasExistingBlocks = Array.isArray(previewFile.blocks) && previewFile.blocks.length > 0;
    const nextBlocks = hasExistingBlocks
      ? previewFile.blocks
      : (trimmed ? [{ text: trimmed, label: 'Content' }] : []);
    setUploadedFiles(prev => prev.map(f => {
      if (f.id === previewFile.id) {
        const updated = {
          ...f,
          content: trimmed,
          text: trimmed,
          blocks: nextBlocks,
          structuredText: f.structuredText ? trimmed : f.structuredText,
        };
        return updated;
      }
      return f;
    }));
    setPreviewFile(prev =>
      prev
        ? {
            ...prev,
            content: trimmed,
            text: trimmed,
            blocks: nextBlocks,
            structuredText: prev.structuredText ? trimmed : prev.structuredText,
          }
        : null,
    );
    showToast('บันทึกการแก้ไขแล้ว', 'success');
    setPreviewContent(trimmed);
    setPreviewEditMode(false);
  };

  const handleClosePreview = () => {
    setIsPreviewModalOpen(false);
    setPreviewFile(null);
    setPreviewContent('');
    setPreviewEditMode(false);
    setPreviewAiStructuring(false);
    setSelectedPreviewChunks([]);
    setPreviewTableSheets([]);
    setPreviewActiveSheetIdx(0);
    setExpandedCellEditor(null);
  };

  const updatePreviewTableCell = (sheetIdx, rowIdx, columnName, value) => {
    setPreviewTableSheets((prev) =>
      prev.map((sheet, sIdx) => {
        if (sIdx !== sheetIdx) return sheet;
        const nextRows = (sheet.rows || []).map((row, rIdx) =>
          rIdx === rowIdx ? { ...row, [columnName]: value } : row
        );
        return { ...sheet, rows: nextRows };
      })
    );
  };

  const addPreviewTableRow = (sheetIdx) => {
    setPreviewTableSheets((prev) =>
      prev.map((sheet, sIdx) => {
        if (sIdx !== sheetIdx) return sheet;
        const emptyRow = {};
        (sheet.columns || []).forEach((column) => {
          emptyRow[column] = '';
        });
        return { ...sheet, rows: [...(sheet.rows || []), emptyRow] };
      })
    );
  };

  const removePreviewTableRow = (sheetIdx, rowIdx) => {
    setPreviewTableSheets((prev) =>
      prev.map((sheet, sIdx) => {
        if (sIdx !== sheetIdx) return sheet;
        return {
          ...sheet,
          rows: (sheet.rows || []).filter((_, idx) => idx !== rowIdx),
        };
      })
    );
  };

  const openExpandedCellEditor = (sheetIdx, rowIdx, columnName, value) => {
    setExpandedCellEditor({
      sheetIdx,
      rowIdx,
      columnName,
      value: String(value ?? ''),
    });
  };

  const closeExpandedCellEditor = () => {
    setExpandedCellEditor(null);
  };

  const saveExpandedCellEditor = () => {
    if (!expandedCellEditor) return;
    updatePreviewTableCell(
      expandedCellEditor.sheetIdx,
      expandedCellEditor.rowIdx,
      expandedCellEditor.columnName,
      expandedCellEditor.value,
    );
    setExpandedCellEditor(null);
  };

  const handleStructureOcrWithAi = async () => {
    if (!previewFile || !id) return;
    const ocrRows = buildOcrBlockRows(previewFile.blocks);
    const hasSelectableChunks = ocrRows.length > 0;
    const selectedRows = hasSelectableChunks
      ? ocrRows.filter((row) => selectedPreviewChunks.includes(row.idx))
      : [];

    if (hasSelectableChunks && selectedRows.length === 0) {
      showToast('กรุณาเลือกอย่างน้อย 1 chunk ก่อนจัดเรียงด้วย AI', 'error');
      return;
    }
    setPreviewAiStructuring(true);
    try {
      if (hasSelectableChunks) {
        const selectedChunkSet = new Set(selectedRows.map((row) => row.idx));
        const currentBlocks = Array.isArray(previewFile.blocks) ? previewFile.blocks : [];
        const nextBlocks = [...currentBlocks];
        let changedCount = 0;

        for (let i = 0; i < currentBlocks.length; i += 1) {
          const rowIdx = i + 1;
          if (!selectedChunkSet.has(rowIdx)) continue;
          const block = currentBlocks[i] || {};
          const rawChunk = String(block.text ?? block.content ?? '').trim();
          if (!rawChunk) continue;

          const data = await documentAPI.structureOcrWithAi(id, rawChunk);
          if (!data?.ok || typeof data.text !== 'string') {
            throw new Error(data?.error || `จัดเรียง chunk ${rowIdx} ไม่สำเร็จ`);
          }
          const nextChunk = data.text.trim();
          const currentLabel = String(block.label ?? block.type ?? block.role ?? '').trim() || `Chunk ${rowIdx}`;
          const nextLabel = currentLabel.includes('จัดเรียงด้วย AI')
            ? currentLabel
            : `${currentLabel} • จัดเรียงด้วย AI`;
          nextBlocks[i] = {
            ...block,
            text: nextChunk,
            content: nextChunk,
            label: nextLabel,
          };
          changedCount += 1;
        }

        if (changedCount === 0) {
          showToast('chunk ที่เลือกไม่มีข้อความให้จัดเรียง', 'error');
          return;
        }

        const mergedText = nextBlocks
          .map((b) => String(b?.text ?? b?.content ?? '').trim())
          .filter(Boolean)
          .join('\n\n')
          .trim();

        setPreviewEditMode(true);
        setPreviewContent(mergedText);
        setPreviewFile((prev) =>
          prev
            ? {
                ...prev,
                text: mergedText,
                content: mergedText,
                blocks: nextBlocks,
                structuredText: '',
              }
            : null,
        );
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === previewFile.id
              ? {
                  ...f,
                  text: mergedText,
                  content: mergedText,
                  blocks: nextBlocks,
                  structuredText: '',
                }
              : f,
          ),
        );
        showToast(`จัดเรียงข้อความด้วย AI สำหรับ ${changedCount} chunk เรียบร้อยแล้ว`, 'success');
        return;
      }

      const raw = previewEditMode ? previewContent : flattenBlocksToText(previewFile);
      if (!raw?.trim()) {
        showToast('ไม่มีข้อความให้จัดเรียง', 'error');
        return;
      }
      const data = await documentAPI.structureOcrWithAi(id, raw);
      if (!data?.ok || typeof data.text !== 'string') {
        throw new Error(data?.error || 'จัดเรียงไม่สำเร็จ');
      }
      const next = data.text.trim();
      const nextBlocks = [{ text: next, label: 'จัดเรียงด้วย AI' }];
      setPreviewEditMode(true);
      setPreviewContent(next);
      setPreviewFile((prev) =>
        prev
          ? {
              ...prev,
              text: next,
              content: next,
              blocks: nextBlocks,
              structuredText: next,
            }
          : null,
      );
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.id === previewFile.id
            ? {
                ...f,
                text: next,
                content: next,
                blocks: nextBlocks,
                structuredText: next,
              }
            : f,
        ),
      );
      showToast('ปรับข้อความด้วย AI แล้ว (แก้คำผิด/วรรคตอน โดยคงเนื้อหาเดิม) — ตรวจสอบแล้วกดบันทึก', 'success');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setPreviewAiStructuring(false);
    }
  };

  /** แปลงข้อความเป็นโครงสร้างตารางเฉพาะเมื่อมีตัวแบ่งชัด (| markdown, tab, ช่องว่าง 2+ ตัว) — ไม่เดาจากทุก N บรรทัด */
  const parseContentForDisplay = (text) => {
    if (!text || !text.trim()) return { type: 'empty', content: '', blocks: [] };
    const blocks = [];
    const allLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!allLines.length) return { type: 'empty', content: '', blocks: [] };

    const splitTableLine = (line) => {
      if (line.includes('\t')) return line.split(/\t/).map(c => c.trim());
      const bySpaces = line.split(/\s{2,}/).map(c => c.trim());
      return bySpaces.length >= 2 ? bySpaces : [];
    };
    const lineHasMultipleCols = (line) => splitTableLine(line).length >= 2;

    const tryTable = (lines) => {
      if (!lines.length) return null;
      const markdownRows = lines.filter(l => /^\|.+\|/.test(l)).map(l =>
        l.split(/\|/).slice(1, -1).map(c => c.trim())
      );
      if (markdownRows.length >= 2) return { rows: markdownRows };
      const rows = lines.map(l => splitTableLine(l)).filter(r => r.length >= 2);
      if (rows.length < 2) return null;
      const colCounts = rows.map(r => r.length);
      const maxCols = Math.max(...colCounts);
      const minCols = Math.min(...colCounts);
      if (minCols < 2 || maxCols - minCols > 1) return null;
      const padded = rows.map(r => {
        const arr = [...r];
        while (arr.length < maxCols) arr.push('');
        return arr;
      });
      return { rows: padded };
    };

    let i = 0;
    while (i < allLines.length) {
      const line = allLines[i];
      if (/^\|.+\|/.test(line)) {
        const tableLines = [];
        while (i < allLines.length && /^\|.+\|/.test(allLines[i])) {
          tableLines.push(allLines[i]);
          i++;
        }
        const t = tryTable(tableLines);
        if (t) blocks.push({ type: 'table', rows: t.rows });
        else blocks.push({ type: 'text', content: tableLines.join('\n') });
        continue;
      }
      if (!lineHasMultipleCols(line)) {
        const textRun = [];
        while (i < allLines.length && !lineHasMultipleCols(allLines[i]) && !/^\|.+\|/.test(allLines[i])) {
          textRun.push(allLines[i]);
          i++;
        }
        blocks.push({ type: 'text', content: textRun.join('\n') });
        continue;
      }
      const run = [];
      while (i < allLines.length && lineHasMultipleCols(allLines[i])) {
        run.push(allLines[i]);
        i++;
      }
      const t = tryTable(run);
      if (t) blocks.push({ type: 'table', rows: t.rows });
      else blocks.push({ type: 'text', content: run.join('\n') });
    }
    return { type: 'blocks', blocks: blocks.length ? blocks : [{ type: 'text', content: text }] };
  };

  /** แถวสำหรับตารางดูผล OCR แบบ Typhoon (รองรับคีย์หลายแบบจาก API) */
  const buildOcrBlockRows = (blocks) => {
    if (!Array.isArray(blocks) || !blocks.length) return [];
    return blocks
      .map((b, i) => {
        const pageRaw = b.page ?? b.page_num ?? b.pageNumber;
        const page =
          pageRaw === undefined || pageRaw === null || pageRaw === ''
            ? ''
            : String(pageRaw);
        const label = String(b.label ?? b.type ?? b.role ?? '').trim() || '—';
        const text = String(b.text ?? b.content ?? '').trim();
        return { idx: i + 1, page, label, text };
      })
      .filter((r) => r.text);
  };

  // Mock files feature removed - use real file upload only

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!id) {
      setError('Document ID is required');
      setLoading(false);
      return;
    }

    if (uploadedFiles.length === 0) {
      setError('กรุณาอัพโหลดไฟล์อย่างน้อย 1 ไฟล์');
      setLoading(false);
      return;
    }

    // Text mode: must upload text as file first (click Upload)
    const hasPendingTextContent = dataType === 'text' && (
      (typeof dataContent === 'string' && dataContent.trim().length > 0) ||
      (typeof textFileName === 'string' && textFileName.trim().length > 0)
    );
    if (hasPendingTextContent) {
      const missingFileName = typeof textFileName === 'string' && !textFileName.trim();
      const message = missingFileName
        ? 'กรุณาตั้งชื่อไฟล์ข้อความ แล้วกด Upload ก่อนบันทึก Vector'
        : 'ยังมีข้อความในช่อง Text กรุณากด Upload ก่อนบันทึก Vector';
      setFileError(message);
      setError(message);
      showToast(message, 'warning');
      setLoading(false);
      return;
    }

    // Validate that all files have content
    const filesWithContent = uploadedFiles.filter(file => {
      const hasText = (file.text || file.content) && (file.text || file.content).trim();
      const hasBlocks = file.blocks && Array.isArray(file.blocks) && file.blocks.length > 0;
      return hasText || hasBlocks;
    });

    if (filesWithContent.length === 0) {
      setError('กรุณาอัพโหลดไฟล์ที่มีเนื้อหาอย่างน้อย 1 ไฟล์');
      setLoading(false);
      return;
    }

    try {
      // Convert uploaded files to sourceFiles format
      const sourceFiles = uploadedFiles.map(file => {
        // If file is existing, use original sourceFile structure if available
        // Otherwise reconstruct from current file data
        if (file.existing && file.originalSourceFile) {
          // Use original structure but update text/blocks if edited
          const original = { ...file.originalSourceFile };
          if (file.text || file.content) {
            original.text = file.text || file.content || original.text || '';
            if (file.blocks && file.blocks.length > 0) {
              original.blocks = file.blocks;
            } else if (original.text) {
              original.blocks = [{ text: original.text, label: 'Content' }];
            }
          }
          // Remove UI-only properties
          const { id, existing, originalSourceFile, type, content, size, sizeMB, needsOCR, file: fileObj, ...cleanFile } = original;
          return cleanFile;
        }
        
        // For new files, create proper sourceFiles structure
        const sourceFile = {
          name: file.name || file.fileName || 'file.txt',
          fileName: file.fileName || file.name || 'file.txt',
        };
        
        // Add text if available
        if (file.text || file.content) {
          sourceFile.text = (file.text || file.content || '').trim();
        }

        if (file.metadata && typeof file.metadata === 'object') {
          sourceFile.metadata = file.metadata;
        }
        
        // Add blocks if available
        if (file.blocks && file.blocks.length > 0) {
          // Ensure blocks have text content
          sourceFile.blocks = file.blocks
            .map(block => {
              if (typeof block === 'string') {
                return { text: block.trim(), label: 'Content' };
              }
              if (typeof block === 'object' && block.text) {
                return { text: block.text.trim(), label: block.label || 'Content' };
              }
              return null;
            })
            .filter(block => block && block.text && block.text.length > 0);
        }
        
        // If no blocks but has text, create blocks from text
        if ((!sourceFile.blocks || sourceFile.blocks.length === 0) && sourceFile.text) {
          sourceFile.blocks = [{ text: sourceFile.text, label: 'Content' }];
        }
        
        // Ensure we have either text or blocks
        if (!sourceFile.text && (!sourceFile.blocks || sourceFile.blocks.length === 0)) {
          // Skip files without content (needsOCR files without processed content)
          console.warn(`Skipping file ${sourceFile.name} - no text or blocks content`);
          return null;
        }
        
        return sourceFile;
      }).filter(file => {
        // Filter out null files and files without text or blocks
        if (!file) return false;
        const hasText = file.text && file.text.trim().length > 0;
        const hasBlocks = file.blocks && Array.isArray(file.blocks) && file.blocks.length > 0;
        return hasText || hasBlocks;
      });

      if (sourceFiles.length === 0) {
        setError('กรุณาอัพโหลดไฟล์ที่มีเนื้อหาอย่างน้อย 1 ไฟล์ (ไฟล์ที่ต้องการ OCR ต้องรอให้ประมวลผลเสร็จก่อน)');
        setLoading(false);
        return;
      }

      // Validate sourceFiles structure before sending
      const invalidFiles = sourceFiles.filter(file => {
        const hasText = file.text && file.text.trim().length > 0;
        const hasBlocks = file.blocks && Array.isArray(file.blocks) && file.blocks.length > 0;
        return !hasText && !hasBlocks;
      });
      
      if (invalidFiles.length > 0) {
        console.error('Invalid sourceFiles structure:', invalidFiles);
        setError(`มีไฟล์ ${invalidFiles.length} ไฟล์ที่ไม่มีเนื้อหา กรุณาตรวจสอบไฟล์อีกครั้ง`);
        setLoading(false);
        return;
      }

      // Update document with new sourceFiles
      await documentAPI.updateDocument(id, {
        sourceFiles: sourceFiles
      });

      showToast('บันทึกไฟล์สำเร็จ กำลังประมวลผลและแปลงเป็น vector...', 'success');
      
      // Clear state after successful save to prevent files from persisting
      setUploadedFiles([]);
      setDataContent('');
      setTextFileName('');
      setError(null);
      
      // Navigate back to knowledge page
      setTimeout(() => {
    navigate('/knowledge');
      }, 1000);
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      setError(errorMsg);
      console.error('Error saving files:', err);
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='flex h-screen bg-white relative'>
      {/* Sidebar Component */}
      <Sidebar onCollapseChange={setIsSidebarCollapsed} />

      {/* Main Content */}
      <main className={`flex-1 bg-white px-8 py-6 overflow-auto flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'pl-16' : ''}`}>
        {/* Back Button */}
        <button
          onClick={() => navigate('/knowledge')}
          className='flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors mb-6 self-start'
        >
          <HiArrowLeft className='text-lg' />
          <span>Back to Knowledge</span>
        </button>

        <form onSubmit={handleSubmit} className='flex-1 max-w-6xl'>
          {/* Error Message */}
          {error && (
            <div className='mb-6 p-4 bg-red-50 border-2 border-red-300 rounded-lg shadow-sm'>
              <div className='flex items-start gap-2'>
                <span className='text-red-600 font-bold text-lg'>⚠️</span>
                <div className='flex-1'>
                  <p className='text-red-800 text-sm font-semibold mb-1'>เกิดข้อผิดพลาด:</p>
                  <p className='text-red-700 text-sm whitespace-pre-wrap break-words'>{error}</p>
                </div>
                <button
                  type='button'
                  onClick={() => setError(null)}
                  className='text-red-400 hover:text-red-600 transition-colors flex-shrink-0'
                >
                  <HiX className='text-lg' />
                </button>
              </div>
            </div>
          )}

          {/* Header */}
          <div className='mb-8'>
            <h1 className='text-3xl font-bold text-gray-800 mb-2'>Add Data to Knowledge</h1>
            <p className='text-gray-600'>
              {document ? `Knowledge: ${document.displayName}` : `Knowledge ID: ${id}`}
            </p>
            <p className='text-sm text-gray-500 mt-1'>
              ไฟล์ที่อัพโหลดจะถูกแปลงเป็น vector และเก็บใน Qdrant สำหรับการค้นหา
            </p>
          </div>

          {/* Data Type and Content Section */}
          <div className='mb-8'>
            <div className='flex gap-6'>
              <div className='flex-1'>
                <label className='block text-sm font-medium text-gray-700 mb-3'>
                  ประเภทข้อมูล (Data Type)
                </label>
                <Dropdown
                  options={dataTypeOptions}
                  selectedValue={dataType}
                  onSelect={(value) => {
                    setDataType(value);
                    setFileError(''); // Clear error when changing data type
                  }}
                  placeholder="Select Data Type"
                />
                
                {/* Text File Name Input - shown only when text type is selected */}
                {dataType === 'text' && (
                  <div className='mt-4'>
                    <label htmlFor='text-file-name' className='block text-sm font-medium text-gray-700 mb-2'>
                      ชื่อไฟล์ (File Name)
                    </label>
                    <input
                      type='text'
                      id='text-file-name'
                      value={textFileName}
                      onChange={(e) => setTextFileName(e.target.value)}
                      placeholder='ตั้งชื่อไฟล์สำหรับข้อความที่นี่...'
                      className='w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400'
                    />
                    <p className='text-xs text-amber-700 mt-1'>* ต้องตั้งชื่อไฟล์ และกด Upload ก่อนบันทึก Vector</p>
                  </div>
                )}

                {/* Data Content */}
                <div className='mt-4'>
                  <label htmlFor='data-content' className='block text-sm font-medium text-gray-700 mb-3'>
                    เนื้อหาข้อมูล (Data Content)
                  </label>
                  {dataType === 'text' ? (
                    <>
                      <textarea
                        id='data-content'
                        value={dataContent}
                        onChange={(e) => setDataContent(e.target.value)}
                        placeholder='เพิ่มเนื้อหาข้อมูลที่นี่...'
                        rows={10}
                        required
                        className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-all resize-none text-gray-700 placeholder-gray-400'
                      />
                      {/* Upload Button for Text Type */}
                      <div className='flex justify-end mt-2'>
                        <button
                          type='button'
                          onClick={() => {
                            if (!textFileName.trim()) {
                              setFileError('กรุณากรอกชื่อไฟล์');
                              return;
                            }
                            if (!dataContent.trim()) {
                              setFileError('กรุณากรอกเนื้อหาข้อมูล');
                              return;
                            }
                            setFileError('');
                            handleFileAdd({ name: textFileName + '.txt' });
                          }}
                          className='px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 hover:scale-105 active:scale-95'
                        >
                          Upload
                        </button>
                      </div>
                    </>
                  ) : dataType === 'file' ? (
                    <div>
                      <div 
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                          isDragging 
                            ? 'border-yellow-400 bg-yellow-50' 
                            : 'border-gray-300 hover:border-yellow-400'
                        }`}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDragging(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDragging(false);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDragging(false);
                          
                          const files = e.dataTransfer.files;
                          if (files.length > 1) {
                            setFileError('กรุณาอัปโหลดไฟล์ครั้งละ 1 ไฟล์เท่านั้น');
                            return;
                          }
                          
                          if (files.length === 1) {
                            const file = files[0];
                            if (!isSupportedUploadFile(file)) {
                              setFileError('รองรับไฟล์ PDF, XLSX, XLS และ CSV เท่านั้น');
                              return;
                            }
                            handleFileAdd(file);
                          }
                        }}
                      >
                      <input
                        type='file'
                        onChange={(e) => {
                            const files = e.target.files;
                            if (files.length > 1) {
                              setFileError('กรุณาอัปโหลดไฟล์ครั้งละ 1 ไฟล์เท่านั้น');
                              e.target.value = '';
                              return;
                            }
                            
                            if (files.length === 1) {
                              handleFileAdd(files[0]);
                            // Reset the input
                            e.target.value = '';
                          }
                        }}
                        className='hidden'
                        id='file-upload'
                        accept='.pdf,.xlsx,.xls,.csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv'
                      />
                      <label
                        htmlFor='file-upload'
                        className='cursor-pointer flex flex-col items-center gap-2'
                      >
                        <HiPlus className='text-3xl text-gray-400' />
                        <span className='text-gray-600'>Click to upload file</span>
                        <span className='text-sm text-gray-400'>or drag and drop</span>
                        <span className='text-xs text-red-500 font-semibold mt-2'>**รองรับ PDF, XLSX, XLS, CSV ครั้งละ 1 ไฟล์ และขนาดไม่เกิน 5 MB**</span>
                      </label>
                      </div>
                      {fileError && (
                        <div className='mt-2 p-2 bg-red-50 border border-red-200 rounded-lg'>
                          <p className='text-xs text-red-600'>{fileError}</p>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
              
              {/* Right Column - Uploaded / Existing Files */}
              <div className='w-80 self-start' style={{ marginTop: '71px' }}>
                <div className='flex items-center justify-between gap-2 mb-3'>
                  <label className='block text-sm font-medium text-gray-700'>
                    ไฟล์ใน Knowledge นี้ ({uploadedFiles.length})
                  </label>
                </div>
                <p className='text-xs text-gray-500 mb-2'>
                  {uploadedFiles.filter(f => f.existing).length > 0
                    ? `บันทึกแล้ว ${uploadedFiles.filter(f => f.existing).length} ไฟล์ · รอบนี้เพิ่ม ${uploadedFiles.filter(f => !f.existing).length} ไฟล์`
                    : uploadedFiles.length > 0
                      ? 'ไฟล์ที่เพิ่มในรอบนี้ (กดบันทึกเพื่อเก็บลง Vector)'
                      : 'ยังไม่มีไฟล์ — อัปโหลด PDF/Excel/CSV หรือกลับมาหน้านี้จะเห็นไฟล์ที่บันทึกแล้ว'}
                </p>
                <div className='space-y-2 h-[352px] overflow-y-auto bg-gray-50 rounded-lg p-4 border border-gray-200'>
                  {uploadedFiles.length > 0 ? (
                    uploadedFiles.map((file) => {
                      const fileTypeInfo = getFileTypeInfo(file.name);
                      const pageCount = getPDFPageCount(file) || file.pageCount;
                      const processingTime = file.processingTime 
                        ? formatProcessingTime(file.processingTime)
                        : file.processingOCR && file.processingStartTime
                        ? formatProcessingTime((Date.now() - file.processingStartTime) / 1000)
                        : null;
                      
                      const canViewOcr =
                        !file.processingOCR && !!flattenBlocksToText(file);
                      const canEditContent = canViewOcr;

                      return (
                        <div
                          key={file.id}
                          className='flex flex-col gap-2 p-3 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors'
                        >
                          {/* File Header */}
                          <div className='flex items-start justify-between gap-2'>
                          <div className='flex-1 min-w-0'>
                              <div className='flex items-center gap-2 mb-1'>
                                <span className='text-lg'>{file.fileIcon || fileTypeInfo.icon}</span>
                            <p className='text-sm font-medium text-gray-800 truncate' title={file.name}>
                              {file.name}
                            </p>
                              </div>
                              
                              {/* File Info */}
                              <div className='flex items-center gap-2 flex-wrap text-xs'>
                                <span className={`font-medium ${file.fileType ? fileTypeInfo.color : 'text-gray-600'}`}>
                                  {file.fileType || fileTypeInfo.label}
                                </span>
                                {file.sizeMB && (
                                  <span className='text-gray-500'>
                                    • {file.sizeMB} MB
                                  </span>
                                )}
                                {pageCount && (
                                  <span className='text-gray-500'>
                                    • {pageCount} หน้า
                                  </span>
                                )}
                                {processingTime && (
                                  <span className='text-gray-500'>
                                    • {processingTime}
                                </span>
                              )}
                            </div>
                          </div>
                            
                            {/* Action Buttons */}
                            <div className='flex items-center gap-1 flex-shrink-0'>
                            {canEditContent && (
                              <button
                                type='button'
                                onClick={() => handleEditFile(file)}
                                className='p-1 text-gray-500 hover:text-gray-700 transition-colors'
                                title='แก้ไขข้อความรวม'
                              >
                                <HiOutlinePencil className='text-lg' />
                              </button>
                            )}
                            <button
                              type='button'
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(file.id);
                              }}
                                className='p-1 text-red-600 hover:text-red-700 transition-colors'
                              title='Delete'
                            >
                              <HiX className='text-lg' />
                            </button>
                            </div>
                          </div>

                          {canViewOcr && (
                            <button
                              type='button'
                              onClick={() => handlePreviewFile(file)}
                              className='w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-teal-300 bg-teal-50 text-teal-900 hover:bg-teal-100 hover:border-teal-400 transition-colors'
                              title='เปิดหน้าต่างดูผล OCR แบ่งตามบล็อก'
                            >
                              <HiDocumentText className='text-lg flex-shrink-0' />
                              <span>ดูผล OCR</span>
                            </button>
                          )}
                          
                          {/* Status Badge */}
                          <div className='flex items-center gap-2 flex-wrap'>
                            {file.existing && (
                              <span className='text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded'>
                                บันทึกแล้วใน Knowledge
                              </span>
                            )}
                            {file.processingOCR ? (
                              <span className='text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded flex items-center gap-1'>
                                <span className='animate-spin'>⏳</span>
                                <span>กำลังประมวลผล OCR...</span>
                                {processingTime && (
                                  <span className='text-blue-600'>({processingTime})</span>
                                )}
                              </span>
                            ) : file.text || file.blocks ? (
                              <span className='text-xs bg-green-100 text-green-700 px-2 py-1 rounded flex items-center gap-1'>
                                <span>✓</span>
                                <span>{file.existing ? 'มีใน Knowledge' : 'พร้อมแปลงเป็น Vector'}</span>
                                {processingTime && !file.existing && (
                                  <span className='text-green-600 ml-1'>(ใช้เวลา {processingTime})</span>
                                )}
                              </span>
                            ) : file.needsOCR ? (
                              <span className='text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded flex items-center gap-1'>
                                <span>⚠</span>
                                <span>ต้องการ OCR</span>
                                {file.ocrError && (
                                  <span className='text-yellow-800' title={file.ocrError}>
                                    ({file.ocrError.substring(0, 30)}...)
                                  </span>
                                )}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className='text-center py-8 text-gray-400'>
                      <p className='text-sm'>ยังไม่มีไฟล์ที่อัปโหลด</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className='flex gap-4 pt-4 border-t border-gray-200'>
            <button
              type='button'
              onClick={() => navigate('/knowledge')}
              className='px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors'
            >
              Cancel
            </button>
            <button
              type='submit'
              disabled={loading || uploadedFiles.length === 0}
              className='px-6 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {loading ? 'กำลังบันทึกและแปลงเป็น vector...' : 'บันทึกและแปลงเป็น Vector'}
            </button>
          </div>
        </form>

        {/* Delete Confirmation Modal */}
        {isDeleteConfirmOpen && (
          <>
            {/* Backdrop */}
            <div className='fixed inset-0 bg-black bg-opacity-50 z-40' onClick={handleCancelDelete} />
            
            {/* Confirmation Dialog */}
            <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
              <div className='bg-white rounded-lg shadow-2xl w-full max-w-sm p-6'>
                <h3 className='text-lg font-semibold text-gray-800 mb-4'>
                  ลบไฟล์นี้หรือไม่?
                </h3>
                <p className='text-sm text-gray-600 mb-6'>
                  คุณแน่ใจหรือไม่ว่าต้องการลบไฟล์นี้ การดำเนินการนี้ไม่สามารถเรียกคืนได้
                </p>
                <div className='flex gap-3 justify-end'>
                  <button
                    type='button'
                    onClick={handleCancelDelete}
                    className='px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors'
                  >
                    Cancel
                  </button>
                  <button
                    type='button'
                    onClick={handleConfirmDelete}
                    className='px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200'
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Edit File Modal */}
        {isEditModalOpen && editingFile && (
          <>
            {/* Backdrop */}
            <div className='fixed inset-0 bg-black bg-opacity-50 z-40' onClick={handleCancelEdit} />
            
            {/* Edit Dialog */}
            <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
              <div className='bg-white rounded-lg shadow-2xl w-full max-w-2xl' onClick={(e) => e.stopPropagation()}>
                <div className='px-6 py-4 border-b border-gray-200'>
                  <h3 className='text-lg font-semibold text-gray-800'>
                    แก้ไขไฟล์: {editingFile.name}
                  </h3>
                </div>
                <div className='p-6'>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder='แก้ไขเนื้อหาไฟล์ที่นี่...'
                    rows={15}
                    className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-all resize-none text-gray-700 placeholder-gray-400'
                  />
                </div>
                <div className='px-6 py-4 border-t border-gray-200 flex gap-3 justify-end'>
                  <button
                    type='button'
                    onClick={handleCancelEdit}
                    className='px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors'
                  >
                    Cancel
                  </button>
                  <button
                    type='button'
                    onClick={handleSaveEdit}
                    className='px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200'
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Preview OCR Modal — ดูผล OCR อ่านง่าย แก้ไขได้ */}
        {isPreviewModalOpen && previewFile && (
          <>
            <div className='fixed inset-0 bg-black/60 z-40' onClick={handleClosePreview} />
            <div className='fixed inset-0 z-50 flex items-center justify-center p-3'>
              <div className='bg-white rounded-xl shadow-xl w-full max-w-[96vw] max-h-[95vh] flex flex-col border border-slate-200 overflow-hidden' onClick={(e) => e.stopPropagation()}>
                <div className='px-5 py-4 flex items-center justify-between bg-gradient-to-r from-yellow-400 to-amber-400 text-gray-900 shrink-0 border-b border-amber-500/40'>
                  <div className='flex items-stretch gap-3 min-w-0'>
                    <div className='w-1 rounded-full bg-gray-900/80 shrink-0' aria-hidden />
                    <div className='min-w-0'>
                      <h3 className='text-lg font-semibold tracking-tight'>
                        {previewTableSheets.length > 0 ? 'ตัวอย่างตารางจาก Excel' : 'ผลลัพธ์ OCR'}
                      </h3>
                      <p className='text-sm text-gray-800/90 truncate' title={previewFile.name}>
                        {previewFile.name}
                      </p>
                      <p className='text-xs text-gray-700 mt-1'>จัดเรียงแบบบล็อก — อ่านง่าย</p>
                    </div>
                  </div>
                  <div className='flex items-center gap-2 shrink-0 flex-wrap justify-end'>
                    <button
                      type='button'
                      onClick={() => setPreviewEditMode(!previewEditMode)}
                      className='px-3 py-1.5 text-sm border border-gray-800/25 rounded-lg text-gray-900 hover:bg-yellow-300/70 transition-colors'
                    >
                      {previewEditMode ? 'ดูผล' : 'แก้ไขข้อความ'}
                    </button>
                    {previewEditMode && (
                      <button
                        type='button'
                        onClick={handleSavePreviewEdit}
                        className='px-3 py-1.5 text-sm bg-gray-900 hover:bg-gray-800 text-yellow-50 font-medium rounded-lg'
                      >
                        บันทึก
                      </button>
                    )}
                    <button
                      type='button'
                      onClick={handleClosePreview}
                      className='p-1.5 text-gray-800 hover:text-gray-950 rounded-lg hover:bg-black/10'
                      aria-label='ปิด'
                    >
                      <HiX className='text-xl' />
                    </button>
                  </div>
                </div>
                <div className='p-5 overflow-y-auto flex-1 bg-slate-50'>
                  {previewEditMode ? (
                    previewTableSheets.length > 0 ? (
                      <div className='space-y-4'>
                        <div className='rounded-lg border border-slate-200 bg-white p-3 flex flex-wrap items-center justify-between gap-3'>
                          <div className='flex flex-wrap gap-2'>
                            {previewTableSheets.map((sheet, sheetIdx) => (
                              <button
                                key={`${sheet?.name || 'sheet'}-${sheetIdx}`}
                                type='button'
                                onClick={() => setPreviewActiveSheetIdx(sheetIdx)}
                                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                                  previewActiveSheetIdx === sheetIdx
                                    ? 'bg-teal-50 border-teal-400 text-teal-800'
                                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                {sheet?.name || `Sheet ${sheetIdx + 1}`}
                              </button>
                            ))}
                          </div>
                          <button
                            type='button'
                            onClick={() => addPreviewTableRow(previewActiveSheetIdx)}
                            className='px-3 py-1.5 rounded-md text-sm border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors'
                          >
                            + เพิ่มแถว
                          </button>
                        </div>
                        {(() => {
                          const activeSheet = previewTableSheets[previewActiveSheetIdx];
                          const columns = Array.isArray(activeSheet?.columns) ? activeSheet.columns : [];
                          const rows = Array.isArray(activeSheet?.rows) ? activeSheet.rows : [];
                          if (!columns.length) return <p className='text-slate-500'>ไม่มีคอลัมน์ให้แก้ไข</p>;
                          return (
                            <div className='rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden'>
                              <div className='overflow-x-auto max-h-[62vh] overflow-y-auto'>
                                <table className='min-w-full border-collapse text-sm'>
                                  <thead className='sticky top-0 z-10'>
                                    <tr className='bg-slate-50 border-b border-slate-200 text-left text-xs text-slate-600'>
                                      <th className='px-3 py-2.5 font-semibold w-12'>#</th>
                                      {columns.map((column, colIdx) => (
                                        <th key={`edit-col-${colIdx}`} className='px-3 py-2.5 font-semibold whitespace-nowrap'>
                                          {column}
                                        </th>
                                      ))}
                                      <th className='px-3 py-2.5 font-semibold w-24'>ลบ</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((row, rowIdx) => (
                                      <tr key={`edit-row-${rowIdx}`} className={`border-b border-slate-100 align-top ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}`}>
                                        <td className='px-3 py-3 text-slate-500 tabular-nums'>{rowIdx + 1}</td>
                                        {columns.map((column, colIdx) => (
                                          <td key={`edit-cell-${rowIdx}-${colIdx}`} className='px-2 py-2'>
                                            <input
                                              type='text'
                                              value={String(row?.[column] ?? '')}
                                              onClick={() => openExpandedCellEditor(previewActiveSheetIdx, rowIdx, column, row?.[column] ?? '')}
                                              readOnly
                                              className='w-full min-w-[180px] px-2 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 bg-white cursor-pointer'
                                              title={String(row?.[column] ?? '')}
                                            />
                                          </td>
                                        ))}
                                        <td className='px-3 py-2'>
                                          <button
                                            type='button'
                                            onClick={() => removePreviewTableRow(previewActiveSheetIdx, rowIdx)}
                                            className='px-2.5 py-1.5 text-xs rounded border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors'
                                          >
                                            ลบแถว
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className='flex flex-col gap-3'>
                        {(() => {
                          const ocrRows = buildOcrBlockRows(previewFile.blocks);
                          if (!ocrRows.length) return null;
                          return (
                            <div className='rounded-lg border border-slate-200 bg-white p-3'>
                              <div className='flex flex-wrap items-center justify-between gap-2 mb-2'>
                                <p className='text-xs font-semibold text-slate-700'>
                                  เลือก chunk ที่ต้องการให้ AI จัดเรียง ({selectedPreviewChunks.length}/{ocrRows.length})
                                </p>
                                <div className='flex items-center gap-2'>
                                  <button
                                    type='button'
                                    onClick={() => setSelectedPreviewChunks(ocrRows.map((row) => row.idx))}
                                    className='px-2.5 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors'
                                  >
                                    เลือกทั้งหมด
                                  </button>
                                  <button
                                    type='button'
                                    onClick={() => setSelectedPreviewChunks([])}
                                    className='px-2.5 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors'
                                  >
                                    ล้าง
                                  </button>
                                </div>
                              </div>
                              <div className='max-h-56 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2 pr-1'>
                                {ocrRows.map((row) => {
                                  const selected = selectedPreviewChunks.includes(row.idx);
                                  return (
                                    <button
                                      key={row.idx}
                                      type='button'
                                      onClick={() =>
                                        setSelectedPreviewChunks((prev) => (
                                          selected
                                            ? prev.filter((idx) => idx !== row.idx)
                                            : [...prev, row.idx].sort((a, b) => a - b)
                                        ))
                                      }
                                      className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                                        selected
                                          ? 'border-teal-400 bg-teal-50'
                                          : 'border-slate-200 bg-white hover:bg-slate-50'
                                      }`}
                                    >
                                      <div className='flex items-start justify-between gap-2'>
                                        <p className='text-xs font-semibold text-slate-700'>
                                          Chunk {row.idx}{row.page ? ` (หน้า ${row.page})` : ''}
                                        </p>
                                        <span className={`text-[11px] font-semibold ${selected ? 'text-teal-700' : 'text-slate-400'}`}>
                                          {selected ? 'เลือกแล้ว' : 'คลิกเพื่อเลือก'}
                                        </span>
                                      </div>
                                      <p className='mt-1 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap max-h-20 overflow-hidden'>
                                        {row.text}
                                      </p>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                        <div className='flex flex-wrap items-center justify-end gap-2'>
                          <button
                            type='button'
                            onClick={handleStructureOcrWithAi}
                            disabled={previewAiStructuring}
                            className='px-3 py-1.5 text-sm border border-purple-700/30 rounded-lg bg-purple-50 text-purple-900 hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0'
                          >
                            {previewAiStructuring ? 'กำลังจัดเรียง…' : 'จัดเรียงด้วย AI'}
                          </button>
                        </div>
                        <textarea
                          value={previewContent}
                          onChange={(e) => setPreviewContent(e.target.value)}
                          placeholder='แก้ไขเนื้อหาที่นี่...'
                          rows={20}
                          className='w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm resize-none text-slate-800 bg-white'
                          style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
                        />
                      </div>
                    )
                  ) : (
                    (() => {
                      const structuredText = (previewFile?.structuredText || '').trim();
                      const displayText = previewContent || structuredText;
                      const excelPreviewSheets = Array.isArray(previewFile?.metadata?.previewSheets)
                        ? previewFile.metadata.previewSheets
                        : [];
                      if (excelPreviewSheets.length > 0) {
                        return (
                          <div className='space-y-5'>
                            {excelPreviewSheets.map((sheet, sheetIndex) => {
                              const columns = Array.isArray(sheet?.columns) ? sheet.columns : [];
                              const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
                              if (!columns.length) return null;
                              return (
                                <div key={`${sheet?.name || 'sheet'}-${sheetIndex}`} className='rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden'>
                                  <div className='px-4 py-2 bg-slate-100 border-b border-slate-200 text-sm font-semibold text-slate-700'>
                                    Sheet: {sheet?.name || `Sheet ${sheetIndex + 1}`} ({rows.length} rows preview)
                                  </div>
                                  <div className='overflow-x-auto max-h-[50vh] overflow-y-auto'>
                                    <table className='min-w-full border-collapse text-sm'>
                                      <thead className='sticky top-0 z-10'>
                                        <tr className='bg-slate-50 border-b border-slate-200 text-left text-xs text-slate-600'>
                                          <th className='px-3 py-2.5 font-semibold w-12'>#</th>
                                          {columns.map((column, colIdx) => (
                                            <th key={`${sheetIndex}-col-${colIdx}`} className='px-3 py-2.5 font-semibold whitespace-nowrap'>
                                              {column}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {rows.map((row, rowIdx) => (
                                          <tr
                                            key={`${sheetIndex}-row-${rowIdx}`}
                                            className={`border-b border-slate-100 align-top ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}`}
                                          >
                                            <td className='px-3 py-3 text-slate-500 tabular-nums'>{rowIdx + 1}</td>
                                            {columns.map((column, colIdx) => (
                                              <td key={`${sheetIndex}-cell-${rowIdx}-${colIdx}`} className='px-3 py-3 text-slate-800 leading-relaxed whitespace-pre-wrap'>
                                                {String(row?.[column] ?? '').trim() || '—'}
                                              </td>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }
                      const ocrRows = buildOcrBlockRows(previewFile.blocks);
                      if (ocrRows.length > 0) {
                        const showPageCol = ocrRows.some((r) => r.page !== '');
                        return (
                          <div className='rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden'>
                            <div className='px-4 py-2 bg-slate-100 border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-600'>
                              ตารางบล็อกข้อความจาก OCR
                            </div>
                            <div className='overflow-x-auto'>
                              <table className='min-w-full border-collapse text-sm'>
                                <thead>
                                  <tr className='bg-slate-50 border-b border-slate-200 text-left text-xs text-slate-600'>
                                    <th className='px-3 py-2.5 font-semibold w-12'>#</th>
                                    {showPageCol && <th className='px-3 py-2.5 font-semibold w-16'>หน้า</th>}
                                    <th className='px-3 py-2.5 font-semibold w-36'>ป้ายกำกับ</th>
                                    <th className='px-3 py-2.5 font-semibold'>ข้อความ</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ocrRows.map((row, ri) => (
                                    <tr
                                      key={row.idx}
                                      className={`border-b border-slate-100 align-top ${ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}`}
                                    >
                                      <td className='px-3 py-3 text-slate-500 tabular-nums'>{row.idx}</td>
                                      {showPageCol && (
                                        <td className='px-3 py-3 text-slate-600 whitespace-nowrap'>{row.page || '—'}</td>
                                      )}
                                      <td className='px-3 py-3 text-slate-700 font-medium'>
                                        {String(row.label || '—')
                                          .split('•')
                                          .map((part) => part.trim())
                                          .filter(Boolean)
                                          .map((part, partIdx) => (
                                            <div key={`${row.idx}-label-${partIdx}`} className='leading-relaxed'>
                                              {part === 'จัดเรียงด้วย AI' ? (
                                                <span className='inline-flex items-center rounded-md border border-yellow-300 bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800'>
                                                  {part}
                                                </span>
                                              ) : (
                                                part
                                              )}
                                            </div>
                                          ))}
                                      </td>
                                      <td className='px-3 py-3 text-slate-800 leading-relaxed whitespace-pre-wrap'>{row.text}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      }
                      if (structuredText) {
                        return (
                          <div className='space-y-4'>
                            <div className='inline-flex items-center gap-2 rounded-full bg-purple-50 text-purple-900 text-xs font-semibold px-3 py-1 border border-purple-200'>
                              ผลลัพธ์จัดเรียงด้วย AI
                            </div>
                            {(() => {
                              const parsed = parseContentForDisplay(displayText);
                              if (parsed.type === 'empty' || !parsed.blocks?.length) {
                                return <p className='text-slate-500'>ไม่มีเนื้อหา</p>;
                              }
                              return (
                                <div className='space-y-6'>
                                  {parsed.blocks.map((block, bi) => {
                                    if (block.type === 'table' && block.rows?.length >= 1) {
                                      const [header, ...bodyRows] = block.rows;
                                      return (
                                        <div key={bi} className='overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm'>
                                          <table className='min-w-full border-collapse'>
                                            <thead>
                                              <tr className='bg-slate-100 border-b border-slate-200'>
                                                {(header || []).map((cell, i) => (
                                                  <th key={i} className='px-4 py-3 text-left text-sm font-semibold text-slate-800'>
                                                    {cell}
                                                  </th>
                                                ))}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {bodyRows.map((row, ri) => (
                                                <tr key={ri} className={`border-b border-slate-100 ${ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                                  {(row || []).map((cell, ci) => (
                                                    <td key={ci} className='px-4 py-2.5 text-sm text-slate-700 leading-relaxed'>
                                                      {cell}
                                                    </td>
                                                  ))}
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      );
                                    }
                                    return (
                                      <div key={bi} className='whitespace-pre-wrap text-[15px] text-slate-800 leading-relaxed font-sans bg-white px-5 py-4 rounded-xl border border-slate-100 shadow-sm'>
                                        {block.content || ''}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      }
                      const parsed = parseContentForDisplay(displayText);
                      if (parsed.type === 'empty' || !parsed.blocks?.length) {
                        return <p className='text-slate-500'>ไม่มีเนื้อหา</p>;
                      }
                      return (
                        <div className='space-y-6'>
                          {parsed.blocks.map((block, bi) => {
                            if (block.type === 'table' && block.rows?.length >= 1) {
                              const [header, ...bodyRows] = block.rows;
                              return (
                                <div key={bi} className='overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm'>
                                  <table className='min-w-full border-collapse'>
                                    <thead>
                                      <tr className='bg-slate-100 border-b border-slate-200'>
                                        {(header || []).map((cell, i) => (
                                          <th key={i} className='px-4 py-3 text-left text-sm font-semibold text-slate-800'>
                                            {cell}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {bodyRows.map((row, ri) => (
                                        <tr key={ri} className={`border-b border-slate-100 ${ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                          {(row || []).map((cell, ci) => (
                                            <td key={ci} className='px-4 py-2.5 text-sm text-slate-700 leading-relaxed'>
                                              {cell}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              );
                            }
                            return (
                              <div key={bi} className='whitespace-pre-wrap text-[15px] text-slate-800 leading-relaxed font-sans bg-white px-5 py-4 rounded-xl border border-slate-100 shadow-sm'>
                                {block.content || ''}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {expandedCellEditor && (
          <div className='fixed inset-0 z-[60] flex items-center justify-center p-4' onClick={closeExpandedCellEditor}>
            <div className='absolute inset-0 bg-black/45' />
            <div
              className='relative w-full max-w-3xl rounded-xl bg-white shadow-2xl border border-slate-200 p-4'
              onClick={(e) => e.stopPropagation()}
            >
              <div className='flex items-center justify-between gap-3 mb-3'>
                <h4 className='text-sm font-semibold text-slate-800'>
                  แก้ไขข้อความเต็ม - {expandedCellEditor.columnName}
                </h4>
                <button
                  type='button'
                  onClick={closeExpandedCellEditor}
                  className='p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  aria-label='ปิด'
                >
                  <HiX className='text-lg' />
                </button>
              </div>
              <textarea
                value={expandedCellEditor.value}
                onChange={(e) =>
                  setExpandedCellEditor((prev) => (prev ? { ...prev, value: e.target.value } : prev))
                }
                rows={12}
                className='w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 bg-white resize-y leading-relaxed'
                style={{ whiteSpace: 'pre-wrap' }}
              />
              <div className='mt-3 flex justify-end gap-2'>
                <button
                  type='button'
                  onClick={closeExpandedCellEditor}
                  className='px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50'
                >
                  ยกเลิก
                </button>
                <button
                  type='button'
                  onClick={saveExpandedCellEditor}
                  className='px-3 py-1.5 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700'
                >
                  บันทึกช่องนี้
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default AddKnowledgeData;
