import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip, Select, MenuItem,
  Typography,
  Container,
  TextField,
  Box
} from '@mui/material';
import { FilterAltOff } from "@mui/icons-material";
import Navbar from './navbar';
import NoData from "./assets/nodata.jpg";
import './Dashboard.css';

const textFieldStyles = {
  "& .MuiOutlinedInput-root": {
    "& fieldset": { borderColor: "rgba(255,255,255,0.2)" },
    "&:hover fieldset": { borderColor: "#f064c5" },
    "&.Mui-focused fieldset": { borderColor: "#f064c5" },
    "& input": { color: "white" }
  },
  "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.6)" },
  "& .MuiInputLabel-root.Mui-focused": { color: "#f064c5" }
};

const DataValidationPage = () => {
  const [data, setData] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [openrejectform, setOpenrejectform] = useState(false);
  const store_name = localStorage.getItem("SN");
  const store_location = localStorage.getItem("SA");
  const phone_no = localStorage.getItem("WN");

  const [formData, setFormData] = React.useState({
    message: '',
    email: '',
    product_name: '',
    purchase_date: '',
    store_name: store_name,
    store_location: store_location,
    phone_no: phone_no,
  });

  const [filters, setFilters] = useState({ product_name: 'All', status: 'All' });
  const handleFilterChange = (column, value) => {
    setFilters(prev => ({ ...prev, [column]: value }));
  };

  const filteredData = data.filter(row => {
    const matchProduct = filters.product_name === 'All' || row.product_name === filters.product_name;
    const matchStatus = filters.status === 'All' || row.status === filters.status;
    return matchProduct && matchStatus;
  });

  const getUnique = (arr, key) => ['All', ...new Set(arr.map(item => item[key]).filter(Boolean))];

  const selectStyles = {
    color: 'white',
    border: '1px solid rgba(240,100,197,0.4)',
    '.MuiSvgIcon-root': { color: 'white' },
    minWidth: '130px',
    mt: 1
  };

  const fetchData = async () => {
    try {
      const response = await axios.post('https://warrantystoragebackend.onrender.com/warranty/setup/merchantverifications', {
        store_name: store_name,
        store_location: store_location,
        status: null,
        limit: 10000
      });

      if (response.data.data && response.data.data.length > 0) {
        setData(response.data.data);
      } else {
        setData([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setData([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('https://warrantystoragebackend.onrender.com/warranty/setup/rejectwarranty', formData);
    } catch (error) {
      console.error(error);
    }
    setOpenrejectform(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const [yearexpiry, setYearexpiry] = useState('');
  const [monthexpiry, setMonthexpiry] = useState('');

  const handleyearchange = (e) => setYearexpiry(e.target.value);
  const handlemonthchange = (e) => setMonthexpiry(e.target.value);

  const handleValidationPrompt = (item) => {
    setSelectedItem(item);
    setOpenDialog(true);
  };

  const handleValidation = async (validate) => {
    if (selectedItem) {
      const updatedStatus = validate ? 'validated' : 'rejected';

      try {
        const response = await axios.patch(
          `https://warrantystoragebackend.onrender.com/warranty/setup/merchantverifications/${selectedItem._id}`,
          {
            status: updatedStatus,
            year: yearexpiry,
            month: monthexpiry,
            currdate: selectedItem.purchase_date,
          }
        );
        if (response.data.success) {
          setData((prevData) =>
            prevData.map((item) =>
              item._id === selectedItem._id ? { ...item, status: updatedStatus } : item
            )
          );
        } else {
          console.error('Failed to update warranty status');
        }
      } catch (error) {
        console.error('Error updating warranty status:', error);
      }

      if (updatedStatus === 'rejected') {
        setFormData({
          ...formData,
          product_name: selectedItem.product_name,
          purchase_date: selectedItem.purchase_date,
          email: selectedItem.email,
        });
        setOpenrejectform(true);
      }
    }
    setOpenDialog(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pending Verification': return 'warning';
      case 'validated': return 'success';
      case 'rejected': return 'error';
      default: return 'default';
    }
  };

  return (
    <div className="dashboard-wrapper d-flex flex-column">
      <Navbar />

      <Container maxWidth="xl" sx={{ pt: 4, flexGrow: 1 }}>
        <Box my={4} textAlign="center">
          <Typography variant="h3" className="dashboard-title" gutterBottom>
            Merchant Validation
          </Typography>
          <Typography variant="h6" className="dashboard-subtitle" paragraph>
            Review and validate incoming warranties securely.
          </Typography>
        </Box>

        <Box display="flex" justifyContent="flex-end" alignItems="center" mb={4}>
          <Paper className="dashboard-glass-table" sx={{ p: 1.5, px: 3, display: 'flex', gap: 2, alignItems: 'center', borderRadius: '50px !important' }}>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 'bold' }}>FILTERS</Typography>
            <Select
              value={filters.product_name}
              onChange={(e) => handleFilterChange('product_name', e.target.value)}
              size="small"
              sx={{ ...selectStyles, mt: 0, minWidth: '150px' }}
            >
              {getUnique(data, 'product_name').map(opt => <MenuItem key={opt} value={opt}>{opt === 'All' ? 'All Products' : opt}</MenuItem>)}
            </Select>
            <Select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              size="small"
              sx={{ ...selectStyles, mt: 0, minWidth: '150px' }}
            >
              <MenuItem value="All">All Statuses</MenuItem>
              <MenuItem value="Pending Verification">Pending</MenuItem>
              <MenuItem value="validated">Completed</MenuItem>
              <MenuItem value="rejected">Cancelled</MenuItem>
            </Select>
            <Button
              onClick={() => setFilters({ product_name: 'All', status: 'All' })}
              sx={{ color: '#f064c5', minWidth: 'auto', p: 1 }}
              title="Reset Filters"
            >
              <FilterAltOff />
            </Button>
          </Paper>
        </Box>

        {data.length === 0 ? (
          <Box display="flex" flexDirection="column" alignItems="center" my={5}>
            <img src={NoData} alt="No Data" style={{ maxWidth: "30%", objectFit: "contain", borderRadius: '15px' }} />
            <Typography variant="h5" sx={{ mt: 3, color: 'rgba(255,255,255,0.7)' }}>
              No warranties found
            </Typography>
          </Box>
        ) : (
          <TableContainer component={Paper} className="dashboard-glass-table">
            <Table sx={{ minWidth: 650 }}>
              <TableHead>
                <TableRow>
                  <TableCell className="dashboard-table-header">ID</TableCell>
                  <TableCell className="dashboard-table-header">Email</TableCell>
                  <TableCell className="dashboard-table-header">Product</TableCell>
                  <TableCell className="dashboard-table-header">Purchased</TableCell>
                  <TableCell className="dashboard-table-header">Expiry</TableCell>
                  <TableCell className="dashboard-table-header">Store</TableCell>
                  <TableCell className="dashboard-table-header">Location</TableCell>
                  <TableCell className="dashboard-table-header">Status</TableCell>
                  <TableCell className="dashboard-table-header">Invoice</TableCell>
                  <TableCell className="dashboard-table-header" align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredData.map((row) => {
                  const fileTypePrefix = row.invoice.slice(0, 5);
                  const fileType = fileTypePrefix === "JVBER" ? "application/pdf" : "image/png";
                  const fileExtension = fileTypePrefix === "JVBER" ? "pdf" : "png";

                  return (
                    <TableRow
                      key={row._id}
                      sx={{
                        '&:last-child td, &:last-child th': { border: 0 },
                        backgroundColor: row.status === 'validated'
                          ? 'rgba(76, 175, 80, 0.1)'
                          : row.status === 'rejected'
                            ? 'rgba(244, 67, 54, 0.1)'
                            : 'transparent'
                      }}
                    >
                      <TableCell className="dashboard-table-cell">{row._id.substring(0, 6)}...</TableCell>
                      <TableCell className="dashboard-table-cell">{row.email}</TableCell>
                      <TableCell className="dashboard-table-cell">{row.product_name}</TableCell>
                      <TableCell className="dashboard-table-cell">{row.purchase_date}</TableCell>
                      <TableCell className="dashboard-table-cell">{row.expiry_date || 'N/A'}</TableCell>
                      <TableCell className="dashboard-table-cell">{row.store_name}</TableCell>
                      <TableCell className="dashboard-table-cell">{row.store_location}</TableCell>
                      <TableCell className="dashboard-table-cell">
                        <Chip
                          label={row.status}
                          color={getStatusColor(row.status || 'pending')}
                          size="small"
                        />
                      </TableCell>
                      <TableCell className="dashboard-table-cell">
                        <a
                          href={`data:${fileType};base64,${row.invoice}`}
                          download={`invoice.${fileExtension}`}
                          style={{ color: '#f064c5', textDecoration: 'none' }}
                        >
                          Download
                        </a>
                      </TableCell>
                      <TableCell className="dashboard-table-cell" align="center">
                        {row.status === 'Pending Verification' ? (
                          <Button
                            variant="contained"
                            className="dashboard-btn-add"
                            size="small"
                            onClick={() => handleValidationPrompt(row)}
                            sx={{ minWidth: '100px', padding: '5px 15px !important' }}
                          >
                            Verify
                          </Button>
                        ) : (
                          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                            Processed
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Validation Dialog */}
        <Dialog
          open={openDialog}
          onClose={() => setOpenDialog(false)}
          PaperProps={{
            className: "dashboard-dialog-glass",
            style: { borderRadius: '24px', padding: '10px' }
          }}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle className="dashboard-dialog-title" sx={{ textAlign: 'center', fontSize: '1.5rem' }}>
            Validate Entry
          </DialogTitle>
          <DialogContent>
            <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center', mb: 3 }}>
              Determine the warranty duration in years/months if approved.
            </Typography>
            <Box display="flex" gap={2}>
              <TextField
                label="Years"
                value={yearexpiry}
                onChange={handleyearchange}
                fullWidth
                sx={textFieldStyles}
              />
              <TextField
                label="Months"
                value={monthexpiry}
                onChange={handlemonthchange}
                fullWidth
                sx={textFieldStyles}
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'center', p: 3, pt: 1 }}>
            <Button
              onClick={() => handleValidation(false)}
              color="error"
              variant="outlined"
              sx={{ px: 4, borderRadius: '20px' }}
            >
              Reject
            </Button>
            <Button
              onClick={() => handleValidation(true)}
              color="success"
              variant="contained"
              sx={{ px: 4, borderRadius: '20px', background: 'linear-gradient(45deg, #4caf50, #81c784)' }}
            >
              Approve
            </Button>
          </DialogActions>
        </Dialog>

        {/* Rejection Form Dialog */}
        <Dialog
          open={openrejectform}
          onClose={() => setOpenrejectform(false)}
          PaperProps={{
            className: "dashboard-dialog-glass",
            style: { borderRadius: '24px', padding: '16px' }
          }}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle className="dashboard-dialog-title" sx={{ textAlign: 'center' }}>
            Justify Rejection
          </DialogTitle>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <Typography sx={{ color: 'rgba(255,255,255,0.7)', mb: 2, textAlign: 'center' }}>
                Please provide a reason to the client for this rejection.
              </Typography>
              <TextField
                label="Rejection Reason"
                name="message"
                fullWidth
                multiline
                rows={3}
                value={formData.message}
                onChange={handleChange}
                sx={textFieldStyles}
                required
              />
              <Box mt={3} display="flex" justifyContent="center">
                <Button type="submit" className="dashboard-btn-add" variant="contained" sx={{ px: 5 }}>
                  Notify Client
                </Button>
              </Box>
            </form>
          </DialogContent>
        </Dialog>

      </Container>
    </div>
  );
};

export default DataValidationPage;
