export const exportToCSV = (data: {
  patients: ({ feedback: string; name: string; recommendations: string[]; age: number } | {
    feedback: string;
    name: string;
    recommendations: string[];
    age: number
  })[];
  products: ({ feedback: string; price: number; name: string; stars: number } | {
    feedback: string;
    price: number;
    name: string;
    stars: number
  })[]
}, filename: string) => {
  const csvRows = [];
  // @ts-ignore
  const headers = Object.keys(data[0]);
  csvRows.push(headers.join(',')); // Header row

  // Data rows
  // @ts-ignore
  data.forEach(row => {
    const values = headers.map((header) => row[header]);
    csvRows.push(values.join(','));
  });

  // Blob creation for CSV
  const csvData = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = window.URL.createObjectURL(csvData);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};
