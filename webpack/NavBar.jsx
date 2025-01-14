import React, { useContext, useState, useEffect } from "react";
import ReactDOM from 'react-dom/client';
import { ChakraProvider, Flex, Box, IconButton, Menu, MenuButton, MenuList, MenuItem, useDisclosure, Button, } from "@chakra-ui/react";
import { ChevronDownIcon,} from "@chakra-ui/icons";
import { MdOutlineAccountCircle, MdOutlineEmail } from "react-icons/md";
import websocketURL from './util/websocketURL';
import renderComponent from './util/renderComponent';

const NavBar = ({ authUser }) => {
	const navItemsLeft = {
		"/": "ToolShed",
		"/about": "About",
	};

	const navItemsRight = {};

	if (authUser) {
		navItemsRight["/inbox"] = <MdOutlineEmail />;
		navItemsRight["/account"] = <MdOutlineAccountCircle />;
	} else {
		navItemsRight["/user/login"] = "Log In";
		navItemsRight["/user/new"] = "Sign Up";
		
	}
	const {isOpen, onOpen, onClose} = useDisclosure();

	const [notif, setNotifColor] = useState(false);

	useEffect(() => {
		const s = new WebSocket(websocketURL('inbox'));
		s.addEventListener('message', ({data}) => {
			const msg = JSON.parse(data);
			console.log(msg);
			setNotifColor(true);
		});
	}, []);

	return (
    <Box bg="blue.500" position="sticky" top="0" left="0" w="100%" p="4">
  <Flex alignItems="center" justify="space-between">
    <Flex alignItems="center" justify="space-between" w={{ sm: "65%", md:"30%", lg: "20%" }}>
      <a href="/" style={{ color: "white", fontSize: "24px" }}>
        <strong>{navItemsLeft["/"]}</strong>
      </a>
      {authUser && (
        <Menu isOpen={isOpen} onClose={onClose}>
          <MenuButton
            onClick={onOpen}
            as={Button}
            rightIcon={<ChevronDownIcon />}
            bg="blue.500"
            color="white"
            border="0px"
            fontSize="16px"
            w="max-content"
            transition="all 0.3s ease"
            _focus={{ outline: "none" }}
            _hover={{ bg: "blue.400" }}
          >
            General
          </MenuButton>

          <MenuList
            onMouseLeave={onClose}
            bg="blue.500"
            style={{ minWidth: "100px" }}
            border="0px"
            transition="all 0.3s ease"
          >
            <MenuItem
              as="a"
              href="/user/me/tools"
              color="white"
              bg="blue.500"
              _hover={{ bg: "blue.400" }}
              _focus={{ bg: "blue.600", boxShadow: "inner", outline: "none" }}
              px="4"
            >
              Tools
            </MenuItem>
            <MenuItem
              as="a"
              href="/tools/new"
              color="white"
              bg="blue.500"
              _hover={{ bg: "blue.400" }}
              _focus={{ bg: "blue.600", boxShadow: "inner", outline: "none" }}
              px="4"
            >
              Add Tool
            </MenuItem>
            <MenuItem
              as="a"
              href="/user/me/listings"
              color="white"
              bg="blue.500"
              _hover={{ bg: "blue.400" }}
              _focus={{ bg: "blue.600", boxShadow: "inner", outline: "none" }}
              px="4"
            >
              Listings
            </MenuItem>
            <MenuItem
              as="a"
              href="/user"
              color="white"
              bg="blue.500"
              _hover={{ bg: "blue.400" }}
              _focus={{ bg: "blue.600", boxShadow: "inner", outline: "none" }}
              px="4"
            >
              Find Users
            </MenuItem>
            <MenuItem
              as="a"
              href="/user/me/reviews"
              color="white"
              bg="blue.500"
              _hover={{ bg: "blue.400" }}
              _focus={{ bg: "blue.600", boxShadow: "inner", outline: "none" }}
              px="4"
            >
              My Reviews
            </MenuItem>
          </MenuList>
        </Menu>
      )}
      {Object.entries(navItemsLeft).map(
        ([url, label]) =>
          url !== "/" && (
            <a
              key={url}
              href={url}
              style={{
                color: "white",
                fontSize: "16px",
                marginLeft: "8px",
                textDecoration: "none",
                transition: "color 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.target.style.color = "#ccc";
              }}
              onMouseLeave={(e) => {
                e.target.style.color = "white";
              }}
            >
              {label}
            </a>
          )
      )}
    </Flex>
    <Flex
      alignItems="center"
      justify="space-around"
      boxSizing="border-box"
      w={{ base: "30%", md: authUser ? "10%"
      : "20%", sm: authUser ? "10%"
      : "20%" }}
    >
      {Object.entries(navItemsRight).map(([url, label]) => (
        <a
        key={url}
        href={url}
        style={{
          color: "white",
          textDecoration: "none",
          transition: "color 0.2s ease",
        }}
        onMouseEnter={(e) => {
        e.target.style.color = "#ccc";
        }}
        onMouseLeave={(e) => {
        e.target.style.color = "white";
        }}
        >
        {typeof label === "string" ? (
        label
        ) : (
          <IconButton
            aria-label={url}
            variant="ghost"
            icon={label}
            fontSize="24px"
            color={url === "/inbox" && notif ? "red" : "white"}
            mr={2}
            _hover={{ bg: "blue.400" }}
            _focus={{ bg: "blue.600", boxShadow: "inner" }}
          />
          )}
        </a>
        ))}
      </Flex>
    </Flex>
  </Box>

  )};
         



renderComponent("#nav", <NavBar {...window.__NavBarProps} />);
