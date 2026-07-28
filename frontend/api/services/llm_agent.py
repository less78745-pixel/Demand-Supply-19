def process_chat_query(query: str, context_data: dict = None) -> str:
    """
    A localized, rule-based NLP engine to simulate GenAI Chat-with-Data.
    """
    query = query.lower()
    
    if context_data is None:
        return "Halo! Saya adalah WMS AI Assistant. Silakan upload data terlebih dahulu di halaman terkait agar saya bisa menganalisanya."
        
    # Pattern matching for mock AI
    if "occupancy" in query or "kapasitas" in query:
        if "kpi_summary" in context_data and "avg_occupancy" in context_data["kpi_summary"]:
            return f"Rata-rata occupancy (kapasitas terpakai) berdasarkan data Anda adalah {context_data['kpi_summary']['avg_occupancy']}%. Puncaknya mencapai {context_data['kpi_summary']['max_occupancy']}%."
        return "Saya tidak melihat data occupancy di konteks saat ini. Apakah Anda sudah mengunggah file di menu Occupancy?"
        
    if "forecast" in query or "prediksi" in query or "terbaik" in query:
        if "best_model" in context_data:
            return f"Berdasarkan backtesting saya, model terbaik untuk data ini adalah {context_data['best_model']}. Model ini mengalahkan algoritma lain berdasarkan nilai error (MAPE) terendah."
            
    if "dead stock" in query or "mati" in query or "lama" in query:
        if "dead_stock" in context_data:
            count = len(context_data['dead_stock'])
            if count > 0:
                cats = ", ".join([x['category'] for x in context_data['dead_stock'][:3]])
                return f"Peringatan! Ada {count} kategori barang yang terindikasi sebagai Dead Stock (Days on Hand > 90 hari). Beberapa di antaranya: {cats}."
            return "Kabar baik! Tidak ada indikasi Dead Stock (barang tertahan lebih dari 90 hari) di gudang Anda saat ini."
            
    if "abc" in query or "penting" in query:
        if "kpi_summary" in context_data and "a_class_count" in context_data["kpi_summary"]:
            return f"Terdapat {context_data['kpi_summary']['a_class_count']} kategori barang Kelas A (penyumbang 80% volume). Sebaiknya barang-barang ini diletakkan di dekat area Outbound (pintu keluar) gudang."
            
    if "halo" in query or "hai" in query:
        return "Halo Elite Commander! WMS AI siap membantu analisa supply chain Anda. Ada metrik tertentu yang ingin dibahas?"
        
    return "Analisa saya menunjukkan data Anda sudah terstruktur dengan baik. Ada pertanyaan spesifik mengenai tren, anomali, atau optimasi tata letak?"
