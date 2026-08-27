import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { IssuancePreviewModal } from './Issuances.jsx';

describe('IssuancePreviewModal', () => {
    const cert = {
        name: 'Juan Dela Cruz',
        number: 'BC-2026-001',
        type: 'birth',
        status: 'Issued',
        file_url: '/storage/documents/birth-certificate.jpg',
        download_url: '/api/documents/download/1?raw=1',
        file_name: 'birth-certificate.jpg',
    };

    const renderModal = (overrides = {}, handlers = {}) => render(
        <IssuancePreviewModal
            cert={{ ...cert, ...overrides }}
            onClose={handlers.onClose || jest.fn()}
            onPrint={handlers.onPrint || jest.fn()}
            onDownload={handlers.onDownload || jest.fn()}
        />
    );

    afterEach(() => {
        document.body.style.overflow = '';
        jest.restoreAllMocks();
    });

    it('renders the original document image when file_url is provided', () => {
        renderModal();

        expect(screen.getByRole('img', { name: cert.name })).toHaveAttribute('src', cert.file_url);
        expect(screen.getByRole('main')).toHaveAttribute('id', 'printable-document');
    });

    it('renders the fallback when the image is missing', () => {
        renderModal({ file_url: null });

        expect(screen.getByRole('status')).toHaveTextContent('Document image unavailable.');
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('renders the fallback when the image fails to load', () => {
        renderModal();
        fireEvent.error(screen.getByRole('img', { name: cert.name }));

        expect(screen.getByRole('status')).toHaveTextContent('Document image unavailable.');
    });

    it('calls the print action, which delegates to window.print', () => {
        const printSpy = jest.spyOn(window, 'print').mockImplementation(() => {});
        const onPrint = () => window.print();
        renderModal({}, { onPrint });

        fireEvent.click(screen.getByRole('button', { name: 'Reprint record' }));

        expect(printSpy).toHaveBeenCalledTimes(1);
    });

    it('does not render redundant scrollable document containers', () => {
        renderModal();
        const printableDocument = screen.getByRole('main');

        expect(printableDocument.className).not.toMatch(/overflow-(auto|scroll|y-scroll)/);
        expect(printableDocument).toHaveClass('flex', 'items-center', 'justify-center', 'max-h-[80vh]');
    });
});
