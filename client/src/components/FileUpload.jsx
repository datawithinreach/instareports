import { useState, useRef } from 'react';
import { csvParse } from 'd3-dsv';
// import {analyzeTable} from 'utils';
import { uploadFile } from '../services/api';
import PropTypes from 'prop-types';
const FileUpload = ({ onDataChange }) => {
  const [fileData, setFileData] = useState([]);
  // const [fileUrl, setFileUrl] = useState("");
  // const [fileDataInfo, setFileDataInfo] = useState([]);
  const [isVisible, setIsVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef(null); // Use ref to access the hidden file input
  

  // Handle file drop
  const handleFileDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    processFile(file);
  };

  // Handle file input
  const handleFileInput = (e) => {
    const file = e.target.files[0];
    processFile(file);
  };



  // Process the file and parse CSV with d3-dsv's csvParse
  const processFile = (file)=>{
    if (file && file.type === 'text/csv') {
      setErrorMessage("");
      const reader = new FileReader();

      reader.onload = async (event) => {
        const csvData = event.target.result;
        const parsedData = csvParse(csvData);
        // const parsedDataInfo = analyzeTable(parsedData);
        setFileData(parsedData);
        // setFileDataInfo(parsedDataInfo);
        setIsVisible(true);
        // save file and get url
        const formData = new FormData();
        formData.append("file", file);  
        const fileUrl = await uploadFile(formData);
        console.log("File URL:", fileUrl);
        // setFileUrl(fileUrl);

        // Send data back to parent
        onDataChange(fileUrl);

        
      };

      reader.readAsText(file);
    } else {
      setErrorMessage("Only CSV files are allowed.");
    }
  };

  // Trigger file input when the user clicks the drop area
  const handleClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="flex flex-col items-center w-full">
      <div
        onDrop={handleFileDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={handleClick} // Trigger input on click
        className="w-full h-40 border border-neutral rounded-lg flex items-center justify-center text-center cursor-pointer hover:bg-base-300"
      >
        <input
          type="file"
          accept=".csv"
          ref={fileInputRef} // Reference the hidden input
          className="hidden"
          onChange={handleFileInput}
        />
        <p className="opacity-60 text-sm">Drag and drop a CSV file here or click to upload</p>
      </div>

      {errorMessage && <p className="text-error mt-4">{errorMessage}</p>}

      {fileData.length > 0 && (
        <button
          className="mt-4 btn btn-sm btn-neutral"
          onClick={() => setIsVisible(!isVisible)}
        >
          {isVisible ? "Hide Table Preview" : "Show Table Preview"}
        </button>
      )}

      {isVisible && (
        <div className="overflow-x-auto max-h-96 mt-4 w-full border border-neutral rounded-lg">
          <table className="table w-full">
            <thead>
              <tr>
                {fileData.length > 0 &&
                  Object.keys(fileData[0]).map((header) => (
                    <th key={header}>{header}</th>
                  ))}
              </tr>
            </thead>
            <tbody className="overflow-y-auto max-h-96">
              {fileData.slice(0, 10).map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {Object.values(row).map((value, cellIndex) => (
                    <td key={cellIndex}>{value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
FileUpload.propTypes = {
  onDataChange: PropTypes.func.isRequired,
};

export default FileUpload;