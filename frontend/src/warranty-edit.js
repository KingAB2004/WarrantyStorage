import React, { useState, useEffect } from "react";
import axios from "axios";
import Navbar from "./navbar";
import { Container, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Button, Paper, Typography, Box, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Snackbar, Alert, Select, MenuItem } from "@mui/material";
import { AddCircleOutline, FilterAltOff } from "@mui/icons-material";
import { useLocation } from 'react-router-dom';
import CheckAuthAndRedirect from './jwt_auth';
import './Dashboard.css';
const WarrantyList = () => {
  CheckAuthAndRedirect();

  const [warranties, setWarranties] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const location = useLocation();
  const [newWarranty, setNewWarranty] = useState({
    email: "",
    product_name: "",
    store_name: "",
    store_location: "",
    invoice: null,
    status: "Pending Verification",
  });

  const [filters, setFilters] = useState({ store_name: 'All', store_location: 'All', status: 'All' });

  const handleFilterChange = (column, value) => {
    setFilters(prev => ({ ...prev, [column]: value }));
  };

  const filteredWarranties = warranties.filter(warranty => {
    const matchStore = filters.store_name === 'All' || warranty.store_name === filters.store_name;
    const matchLocation = filters.store_location === 'All' || warranty.store_location === filters.store_location;
    const matchStatus = filters.status === 'All' || warranty.status === filters.status;
    return matchStore && matchLocation && matchStatus;
  });

  const getUnique = (arr, key) => ['All', ...new Set(arr.map(item => item[key]).filter(Boolean))];

  const selectStyles = {
    color: 'white',
    border: '1px solid rgba(240,100,197,0.4)',
    '.MuiSvgIcon-root': { color: 'white' },
    minWidth: '130px',
    mt: 1
  };

  let data
  useEffect(() => {

    fetchWarranties();
  }, []);
  const fetchWarranties = async () => {
    try {
      data = await localStorage.getItem("Data");
      setNewWarranty((prev) => ({ ...prev, email: data }));
      const response = await axios.post("https://warrantystoragebackend.onrender.com/warranty/setup/getwarranty", { "email": data, "limit": 10000 });
      setWarranties(response.data.data || []);
    } catch (error) {
      console.error("Error fetching warranties:", error);
    }
  };

  const handleDialogOpen = () => setOpenDialog(true);
  const handleDialogClose = () => setOpenDialog(false);

  const handleSnackbarClose = () => setOpenSnackbar(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewWarranty((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    setNewWarranty((prev) => ({ ...prev, invoice: e.target.files[0] }));
  };

  const handleFormSubmit = async () => {
    try {

      const formData = new FormData();
      Object.keys(newWarranty).forEach(key => {
        if (newWarranty[key] !== null && newWarranty[key] !== undefined) {
          formData.append(key, newWarranty[key]);
        }
      });

      const response = await axios.post("https://warrantystoragebackend.onrender.com/warranty/setup/createwarranty", formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      await fetchWarranties();
      setOpenSnackbar(true);

      handleDialogClose();
      setNewWarranty({
        product_name: "",
        purchase_date: "",
        store_name: "",
        store_location: "",
        invoice: null,
        status: "Pending Verification",
      });
    } catch (error) {
      console.error("Error adding warranty:", error);
    }
  };

  const textFieldStyles = {
    "& .MuiOutlinedInput-root": {
      "& fieldset": { borderColor: "rgba(255,255,255,0.2)" },
      "&:hover fieldset": { borderColor: "#f064c5" },
      "&.Mui-focused fieldset": { borderColor: "#f064c5" },
      "& input": { color: "white" }
    },
    "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.6)" },
    "& .MuiInputLabel-root.Mui-focused": { color: "#f064c5" },
    "& input[type='date']::-webkit-calendar-picker-indicator": { filter: 'invert(1)' }
  };

  return (
    <div className="dashboard-wrapper d-flex flex-column">
      <Navbar />
      <Container maxWidth="lg" sx={{ pt: 4, flexGrow: 1 }}>
        <Box my={4} textAlign="center">
          <Typography variant="h3" className="dashboard-title" gutterBottom>
            Warranty Storage
          </Typography>
          <Typography variant="h6" className="dashboard-subtitle" paragraph>
            Keep track of your warranties and always know when they expire.
          </Typography>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={4} flexWrap="wrap" gap={2}>
            <Button
              variant="contained"
              className="dashboard-btn-add"
              startIcon={<AddCircleOutline />}
              onClick={handleDialogOpen}
            >
              Add New Warranty
            </Button>

            <Paper className="dashboard-glass-table" sx={{ p: 1.5, px: 3, display: 'flex', gap: 2, alignItems: 'center', borderRadius: '50px !important' }}>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 'bold' }}>FILTERS</Typography>
              <Select
                value={filters.store_name}
                onChange={(e) => handleFilterChange('store_name', e.target.value)}
                size="small"
                sx={{ ...selectStyles, mt: 0, minWidth: '150px' }}
              >
                {getUnique(warranties, 'store_name').map(opt => <MenuItem key={opt} value={opt}>{opt === 'All' ? 'All Stores' : opt}</MenuItem>)}
              </Select>
              <Select
                value={filters.store_location}
                onChange={(e) => handleFilterChange('store_location', e.target.value)}
                size="small"
                sx={{ ...selectStyles, mt: 0, minWidth: '150px' }}
              >
                {getUnique(warranties, 'store_location').map(opt => <MenuItem key={opt} value={opt}>{opt === 'All' ? 'All Locations' : opt}</MenuItem>)}
              </Select>
              <Select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                size="small"
                sx={{ ...selectStyles, mt: 0, minWidth: '150px' }}
              >
                <MenuItem value="All">All Statuses</MenuItem>
                <MenuItem value="validated">Validated</MenuItem>
                <MenuItem value="rejected">Rejected</MenuItem>
                <MenuItem value="Pending Verification">Pending</MenuItem>
              </Select>
              <Button
                onClick={() => setFilters({ store_name: 'All', store_location: 'All', status: 'All' })}
                sx={{ color: '#f064c5', minWidth: 'auto', p: 1 }}
                title="Reset Filters"
              >
                <FilterAltOff />
              </Button>
            </Paper>
          </Box>

          <TableContainer component={Paper} className="dashboard-glass-table">
            <Table sx={{ minWidth: 650 }} aria-label="warranty table">
              <TableHead>
                <TableRow>
                  <TableCell align="center" className="dashboard-table-header">Warranty ID</TableCell>
                  <TableCell align="center" className="dashboard-table-header">Product Name</TableCell>
                  <TableCell align="center" className="dashboard-table-header">Purchase Date</TableCell>
                  <TableCell align="center" className="dashboard-table-header">Expiry Date</TableCell>
                  <TableCell align="center" className="dashboard-table-header">Store</TableCell>
                  <TableCell align="center" className="dashboard-table-header">Location</TableCell>
                  <TableCell align="center" className="dashboard-table-header">Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredWarranties.length > 0 ? (
                  filteredWarranties.map((warranty) => (
                    <TableRow key={warranty._id}>
                      <TableCell align="center" className="dashboard-table-cell">{warranty._id}</TableCell>
                      <TableCell align="center" className="dashboard-table-cell">{warranty.product_name}</TableCell>
                      <TableCell align="center" className="dashboard-table-cell">{warranty.purchase_date}</TableCell>
                      <TableCell align="center" className="dashboard-table-cell">{warranty.expiry_date}</TableCell>
                      <TableCell align="center" className="dashboard-table-cell">{warranty.store_name}</TableCell>
                      <TableCell align="center" className="dashboard-table-cell">{warranty.store_location}</TableCell>
                      <TableCell align="center" className="dashboard-table-cell">
                        <span style={{
                          color: warranty.status === 'validated' ? '#4caf50' : warranty.status === 'rejected' ? '#f44336' : '#ffa726',
                          fontWeight: '500',
                          textTransform: 'capitalize'
                        }} >{warranty.status}</span>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} align="center" className="dashboard-table-cell" sx={{ py: 5 }}>
                      <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                        No warranties available. Click "Add New Warranty" to get started.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        <Dialog
          open={openDialog}
          onClose={handleDialogClose}
          fullWidth
          maxWidth="md"
          PaperProps={{
            className: "dashboard-dialog-glass",
            style: { borderRadius: '24px', padding: '16px' }
          }}
        >
          <DialogTitle className="dashboard-dialog-title" sx={{ fontSize: '1.8rem', textAlign: 'center', pb: 1 }}>
            Register New Warranty
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', mb: 3 }}>
              Fill in the details below to securely upload your warranty record.
            </Typography>

            <div className="row">
              <div className="col-md-6 mb-2">
                <TextField
                  margin="dense"
                  label="Product Name"
                  name="product_name"
                  fullWidth
                  value={newWarranty.product_name}
                  onChange={handleInputChange}
                  sx={textFieldStyles}
                />
              </div>
              <div className="col-md-6 mb-2">
                <TextField
                  margin="dense"
                  label="Purchase Date"
                  name="purchase_date"
                  type="date"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={newWarranty.purchase_date}
                  onChange={handleInputChange}
                  sx={textFieldStyles}
                />
              </div>
            </div>

            <div className="row mt-2">
              <div className="col-md-6 mb-2">
                <TextField
                  margin="dense"
                  label="Store Name"
                  name="store_name"
                  fullWidth
                  value={newWarranty.store_name}
                  onChange={handleInputChange}
                  sx={textFieldStyles}
                />
              </div>
              <div className="col-md-6 mb-2">
                <TextField
                  margin="dense"
                  label="Store Location"
                  name="store_location"
                  fullWidth
                  value={newWarranty.store_location}
                  onChange={handleInputChange}
                  sx={textFieldStyles}
                />
              </div>
            </div>

            <div className="mt-3 p-3 rounded" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'rgba(255,255,255,0.8)' }}>
                Upload Invoice / Receipt Document
              </Typography>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="dashboard-file-input m-0 border-0 p-1"
              />
            </div>

          </DialogContent>
          <DialogActions sx={{ p: 3, pt: 1, justifyContent: 'center' }}>
            <Button
              onClick={handleDialogClose}
              sx={{ color: 'rgba(255,255,255,0.6)', mr: 2, px: 3 }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFormSubmit}
              className="dashboard-btn-add"
              variant="contained"
              sx={{ px: 5 }}
            >
              Submit Record
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={openSnackbar}
          autoHideDuration={3000}
          onClose={handleSnackbarClose}
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
        >
          <Alert onClose={handleSnackbarClose} severity="success" variant="filled" sx={{ background: '#f064c5' }}>
            Warranty has been sent for verification!
          </Alert>
        </Snackbar>
      </Container>
    </div>
  );
};

export default WarrantyList;
